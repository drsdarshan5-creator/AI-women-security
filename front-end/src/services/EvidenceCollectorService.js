/*
EvidenceCollectorService
- Best-effort evidence collection for SOS activation
- Requests camera/microphone permissions
- Records a short audio snippet automatically
- Attempts to capture photo and short video if a cameraRef (expo-camera) is provided (headless capture requires a mounted Camera component)
- Saves local file URIs and optionally uploads them (uploadToServer placeholder)
- Composes an SMS with links to uploaded evidence for provided recipients (3 priority contacts + admin)

Usage:
import EvidenceCollector from '../services/EvidenceCollectorService';
// Optional: mount a <Camera ref={cameraRef} ... /> somewhere hidden and pass cameraRef to startEvidenceCollection
EvidenceCollector.startEvidenceCollection({
  trigger: 'SOS',
  cameraRef, // optional, to take photo/video without launching system camera UI
  recipients: ['+123..', '+456..', '+789..', '+15550001111'] // optional override
});

Notes/limitations:
- Automatic photo/video capture without a visible Camera component is not allowed on many platforms; to capture silently, mount an <Camera> component and pass the ref here.
- Silent programmatic SMS sending is not implemented. The service opens the SMS composer pre-filled with links to evidence (after upload) so recipients can receive files.
- Upload is a placeholder. Replace uploadToServer with your real backend endpoint or storage provider.
*/

import { Alert, Platform, Linking } from 'react-native';
import {
  getRecordingPermissionsAsync,
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
} from 'expo-audio';

let CameraModule;
let FileSystem;
let MediaLibrary;

try {
  CameraModule = require('expo-camera');
} catch (e) {
  CameraModule = null;
}

try {
  FileSystem = require('expo-file-system');
} catch (e) {
  FileSystem = null;
}

try {
  MediaLibrary = require('expo-media-library');
} catch (e) {
  MediaLibrary = null;
}

// simple sleep helper
const wait = (ms) => new Promise((res) => setTimeout(res, ms));

const CONTACTS_UPLOAD_ENDPOINT = null; // set to real upload endpoint if available

async function requestPermissions() {
  const results = {
    camera: false,
    microphone: false,
    mediaLibrary: false,
  };

  try {
    if (CameraModule && CameraModule.requestCameraPermissionsAsync) {
      const camPerm = await CameraModule.requestCameraPermissionsAsync();
      results.camera = camPerm?.status === 'granted';
    }
  } catch (e) {
    console.warn('Camera permission request failed', e?.message || e);
  }

  try {
    let micPerm = await getRecordingPermissionsAsync();
    if (micPerm.status !== 'granted') {
      micPerm = await requestRecordingPermissionsAsync();
    }
    results.microphone = micPerm.status === 'granted';
  } catch (e) {
    console.warn('Microphone permission request failed', e?.message || e);
  }

  try {
    if (MediaLibrary && MediaLibrary.requestPermissionsAsync) {
      const ml = await MediaLibrary.requestPermissionsAsync();
      results.mediaLibrary = ml?.status === 'granted';
    }
  } catch (e) {
    console.warn('Media Library permission request failed', e?.message || e);
  }

  return results;
}

async function recordAudioSnippet(recorder, seconds = 15) {
  if (!recorder) {
    console.warn('Audio recorder was not provided; skipping audio evidence recording');
    return null;
  }

  try {
    await setAudioModeAsync({
      allowsRecording: true,
      playsInSilentMode: true,
      shouldPlayInBackground: true,
      allowsBackgroundRecording: true,
      interruptionMode: 'duckOthers',
    });

    await recorder.prepareToRecordAsync(RecordingPresets.HIGH_QUALITY);
    recorder.record();

    await wait(seconds * 1000);

    await recorder.stop();
    const uri = recorder.uri;
    console.log('Audio recorded to', uri);
    return uri;
  } catch (e) {
    console.warn('Audio recording failed', e?.message || e);
    return null;
  }
}

async function takePhotoWithCameraRef(cameraRef, options = {}) {
  if (!cameraRef || !cameraRef.current || !cameraRef.current.takePictureAsync) {
    console.warn('No cameraRef available for photo capture');
    return null;
  }
  try {
    const photo = await cameraRef.current.takePictureAsync({ quality: options.quality ?? 0.7, skipProcessing: true });
    return photo?.uri || null;
  } catch (e) {
    console.warn('Photo capture failed', e?.message || e);
    return null;
  }
}

async function recordVideoWithCameraRef(cameraRef, seconds = 5, options = {}) {
  if (!cameraRef || !cameraRef.current || !cameraRef.current.recordAsync) {
    console.warn('No cameraRef available for video capture');
    return null;
  }

  try {
    const result = await cameraRef.current.recordAsync({ maxDuration: seconds, quality: options.quality ?? '480p' });
    return result?.uri || null;
  } catch (e) {
    console.warn('Video capture failed', e?.message || e);
    return null;
  }
}

async function saveToMediaLibraryIfAvailable(uri) {
  if (!uri) return null;
  if (!MediaLibrary || !MediaLibrary.createAssetAsync) return uri;
  try {
    const asset = await MediaLibrary.createAssetAsync(uri);
    return asset?.uri || uri;
  } catch (e) {
    console.warn('Saving to media library failed', e?.message || e);
    return uri;
  }
}

async function saveToLocalAppStorage(uri, prefix) {
  if (!uri || !FileSystem || !FileSystem.documentDirectory) return uri;

  try {
    const extMatch = uri.match(/\.(\w+)(\?.*)?$/);
    const ext = extMatch ? `.${extMatch[1]}` : '.dat';
    const dir = `${FileSystem.documentDirectory}SOSEvidence/`;
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
    const dest = `${dir}${prefix}-${Date.now()}${ext}`;
    if (uri === dest) return uri;
    await FileSystem.copyAsync({ from: uri, to: dest });
    return dest;
  } catch (e) {
    console.warn('Saving evidence to local app storage failed', e?.message || e);
    return uri;
  }
}

async function uploadToServer(uri) {
  // Placeholder: implement your actual upload to S3 / server and return accessible URL
  if (!uri) return null;
  if (!CONTACTS_UPLOAD_ENDPOINT) {
    // no server configured, return file uri so it can be referenced locally (may not be accessible by recipients)
    return uri;
  }

  try {
    const formData = new FormData();
    const filename = uri.split('/').pop();
    const fileType = filename.split('.').pop();
    formData.append('file', { uri, name: filename, type: `application/octet-stream` });
    const res = await fetch(CONTACTS_UPLOAD_ENDPOINT, { method: 'POST', body: formData });
    if (!res.ok) throw new Error(`Upload failed ${res.status}`);
    const json = await res.json();
    return json?.url || null;
  } catch (e) {
    console.warn('Upload failed', e?.message || e);
    return uri; // fallback to local uri
  }
}

async function composeSmsWithEvidence(recipients = [], evidenceUrls = []) {
  if (!recipients || recipients.length === 0) return;

  const bodyLines = ['EMERGENCY EVIDENCE: Please review attached evidence.'];
  evidenceUrls.forEach((u, i) => {
    bodyLines.push(`Evidence ${i + 1}: ${u}`);
  });
  bodyLines.push(`Time: ${new Date().toLocaleString()}`);

  const body = bodyLines.join('\n');
  const separator = Platform.OS === 'ios' ? '&' : '?';
  const url = `sms:${recipients.join(',')}${separator}body=${encodeURIComponent(body)}`;
  try {
    await Linking.openURL(url);
  } catch (e) {
    console.warn('Failed to open SMS composer for evidence', e?.message || e);
    Alert.alert('SMS Failed', 'Unable to open SMS composer to share evidence links.');
  }
}

const EvidenceCollector = {
  requestPermissions: async function () {
    return requestPermissions();
  },
  // options: cameraRef (optional), audioSeconds, videoSeconds, recipients (array)
  startEvidenceCollection: async function (options = {}) {
    const {
      cameraRef = null,
      audioRecorder = null,
      audioSeconds = 15,
      videoSeconds = 8,
      recipients = [],
    } = options;

    // Request permissions
    const perms = await requestPermissions();
    if (!perms.microphone && !perms.camera) {
      console.warn('Neither microphone nor camera permissions granted');
    }

    const collected = {
      photoUri: null,
      videoUri: null,
      audioUri: null,
      uploadedPhotoUrl: null,
      uploadedVideoUrl: null,
      uploadedAudioUrl: null,
    };

    // Start audio recording immediately (best-effort)
    if (perms.microphone) {
      const audioUri = await recordAudioSnippet(audioRecorder, audioSeconds);
      const localAudioUri = await saveToLocalAppStorage(audioUri, 'audio');
      collected.audioUri = localAudioUri || audioUri;
      if (perms.mediaLibrary) {
        await saveToMediaLibraryIfAvailable(localAudioUri);
      }
    }

    // Capture photo if cameraRef provided and camera permission granted
    if (cameraRef && perms.camera) {
      const photoUri = await takePhotoWithCameraRef(cameraRef);
      const localPhotoUri = await saveToLocalAppStorage(photoUri, 'photo');
      collected.photoUri = localPhotoUri || photoUri;
      if (perms.mediaLibrary) {
        await saveToMediaLibraryIfAvailable(localPhotoUri);
      }
    }

    // Capture video if cameraRef provided and camera permission granted
    if (cameraRef && perms.camera) {
      const videoUri = await recordVideoWithCameraRef(cameraRef, videoSeconds);
      const localVideoUri = await saveToLocalAppStorage(videoUri, 'video');
      collected.videoUri = localVideoUri || videoUri;
      if (perms.mediaLibrary) {
        await saveToMediaLibraryIfAvailable(localVideoUri);
      }
    }

    // Upload evidence if you have a server endpoint configured
    const evidenceUrls = [];
    if (collected.photoUri) {
      const u = await uploadToServer(collected.photoUri);
      collected.uploadedPhotoUrl = u;
      evidenceUrls.push(u);
    }
    if (collected.videoUri) {
      const u = await uploadToServer(collected.videoUri);
      collected.uploadedVideoUrl = u;
      evidenceUrls.push(u);
    }
    if (collected.audioUri) {
      const u = await uploadToServer(collected.audioUri);
      collected.uploadedAudioUrl = u;
      evidenceUrls.push(u);
    }

    // If no upload endpoint, evidenceUrls will contain local URIs

    // Share evidence via SMS to recipients (top 3 priority contacts + admin)
    if (recipients && recipients.length > 0) {
      await composeSmsWithEvidence(recipients, evidenceUrls);
    }

    console.log('Evidence collection result:', collected);
    return collected; // return details for app to store and/or upload later
  },

  // Convenience: collect and also return results without SMS
  collectOnly: async function (opts = {}) {
    const localOpts = { ...opts, recipients: [] };
    const res = await this.startEvidenceCollection(localOpts);
    return res;
  },
};

export default EvidenceCollector;
