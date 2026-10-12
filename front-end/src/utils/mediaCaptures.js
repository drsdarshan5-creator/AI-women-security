import { Audio } from 'expo-av';
import { Camera } from 'expo-camera';
import { AppState, Platform } from 'react-native';

// Helper delay to give camera hardware time to reset between frames.
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let activeAudioRecording = null;

async function cleanupPreviousCapture(cameraRef) {
  // Stop any in-flight camera recording before starting another session.
  try {
    if (cameraRef?.current && typeof cameraRef.current.stopRecording === 'function') {
      cameraRef.current.stopRecording();
    }
  } catch (error) {
    console.warn('[SOS Media] Failed to stop previous camera recording gracefully:', error?.message || error);
  }

  // Unload any previous audio recording so the next capture starts from a clean state.
  if (activeAudioRecording) {
    try {
      if (typeof activeAudioRecording.stopAndUnloadAsync === 'function') {
        await activeAudioRecording.stopAndUnloadAsync();
      }
    } catch (error) {
      console.warn('[SOS Media] Could not stop previous audio recording:', error?.message || error);
    }

    try {
      if (typeof activeAudioRecording.unloadAsync === 'function') {
        await activeAudioRecording.unloadAsync();
      }
    } catch (error) {
      console.warn('[SOS Media] Could not unload previous audio recording:', error?.message || error);
    }

    activeAudioRecording = null;
  }
}

async function ensureCapturePermissions() {
  // Must verify permission status before recording starts; otherwise the capture stack fails on some devices.
  let cameraPermission = await Camera.getCameraPermissionsAsync();
  if (cameraPermission.status !== 'granted') {
    cameraPermission = await Camera.requestCameraPermissionsAsync();
  }

  if (cameraPermission.status !== 'granted') {
    throw new Error('Camera permission is required to capture SOS evidence.');
  }

  let micPermission = await Audio.getPermissionsAsync();
  if (micPermission.status !== 'granted') {
    micPermission = await Audio.requestPermissionsAsync();
  }

  if (micPermission.status !== 'granted') {
    throw new Error('Microphone permission is required to capture SOS audio evidence.');
  }

  return true;
}

async function keepEmergencyCaptureAlive() {
  // Prevent Android from immediately pausing the SOS capture task when the app briefly loses foreground focus.
  // Expo AV allows the audio pipeline to remain active while the app is in an emergency state.
  await Audio.setAudioModeAsync({
    allowsRecordingIOS: true,
    playsInSilentModeIOS: true,
    staysActiveInBackground: true,
    shouldDuckAndroid: true,
  });

  if (Platform.OS === 'android') {
    const currentState = AppState.currentState;
    if (currentState !== 'active') {
      console.warn('[SOS Media] App is not active. Emergency capture is continuing with the foreground-safe audio mode.');
    }
  }
}

async function captureAudioSnippet(durationMs = 8000) {
  const recording = new Audio.Recording();
  activeAudioRecording = recording;

  try {
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: true,
      playsInSilentModeIOS: true,
      staysActiveInBackground: true,
      shouldDuckAndroid: true,
    });

    await recording.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
    await recording.startAsync();

    await delay(durationMs);

    await recording.stopAndUnloadAsync();
    const uri = recording.getURI();
    activeAudioRecording = null;
    return uri;
  } catch (error) {
    activeAudioRecording = null;
    throw new Error(`Audio capture failed: ${error?.message || error}`);
  }
}

async function capturePhotos(cameraRef, photoCount = 6) {
  const photos = [];

  if (!cameraRef || !cameraRef.current || typeof cameraRef.current.takePictureAsync !== 'function') {
    console.warn('[SOS Media] Camera is not ready for still image capture. Continuing with audio/location fallback.');
    return photos;
  }

  for (let i = 0; i < photoCount; i += 1) {
    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.5,
        skipProcessing: true,
      });

      if (photo?.uri) {
        photos.push(photo.uri);
      }
    } catch (error) {
      console.warn(`[SOS Media] Photo ${i + 1}/${photoCount} failed:`, error?.message || error);
    }

    await delay(450);
  }

  return photos;
}

async function captureVideo(cameraRef, maxDurationSeconds = 10) {
  if (!cameraRef || !cameraRef.current || typeof cameraRef.current.recordAsync !== 'function') {
    return null;
  }

  const videoData = await cameraRef.current.recordAsync({
    maxDuration: maxDurationSeconds,
    quality: '480p',
  });

  return videoData?.uri || null;
}

export async function captureEmergencyMedia(cameraRef, photoCount = 6) {
  const mediaResults = {
    photos: [],
    videoUri: null,
    audioUri: null,
    errors: [],
  };

  try {
    // Always verify permissions first. If either permission is missing, we fail early with a clear reason.
    await ensureCapturePermissions();

    // Clear any previous active recording object before starting a new SOS session.
    await cleanupPreviousCapture(cameraRef);

    // Force safe audio mode so Android does not suspend the microphone stage during an active SOS.
    await keepEmergencyCaptureAlive();

    // Keep the photo capture short and sequential to avoid camera hardware contention.
    mediaResults.photos = await capturePhotos(cameraRef, photoCount);
    await delay(400);

    // Video capture is best-effort only. If it fails, we still continue to capture audio + location.
    try {
      mediaResults.videoUri = await captureVideo(cameraRef, 10);
      if (mediaResults.videoUri) {
        console.log('[SOS Media] Video saved to:', mediaResults.videoUri);
      }
    } catch (error) {
      const message = error?.message || error;
      mediaResults.errors.push(`video:${message}`);
      console.warn('[SOS Media] Video capture failed, falling back to audio/location evidence:', message);
    }

    // Audio is the resilient fallback that should always work when the camera is unavailable or the device is busy.
    try {
      mediaResults.audioUri = await captureAudioSnippet(8000);
      console.log('[SOS Media] Audio saved to:', mediaResults.audioUri);
    } catch (error) {
      const message = error?.message || error;
      mediaResults.errors.push(`audio:${message}`);
      console.warn('[SOS Media] Audio capture failed. SOS workflow will continue with remaining evidence:', message);
    }

    return mediaResults;
  } catch (error) {
    const message = error?.message || error;
    mediaResults.errors.push(`capture:${message}`);
    console.warn('[SOS Media] Critical media capture setup failed. Attempting final fallback audio capture:', message);

    // Final safety net: if the video/camera stack fails before capture, do not block the emergency flow. 
    try {
      mediaResults.audioUri = await captureAudioSnippet(8000);
    } catch (fallbackError) {
      mediaResults.errors.push(`fallback:${fallbackError?.message || fallbackError}`);
      console.warn('[SOS Media] Fallback audio capture also failed:', fallbackError?.message || fallbackError);
    }

    return mediaResults;
  } finally {
    // Always release the current active recording object when the call is complete.
    await cleanupPreviousCapture(cameraRef);
  }
}