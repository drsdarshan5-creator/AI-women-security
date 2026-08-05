import { Audio } from 'expo-av';

// Helper delay to give camera hardware time to reset between frames
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function captureEmergencyMedia(cameraRef, photoCount = 6) {
  const mediaResults = {
    photos: [],
    videoUri: null,
    audioUri: null,
  };

  if (!cameraRef || !cameraRef.current) {
    console.warn('[SOS Media] Camera reference not attached/ready.');
    return mediaResults;
  }

  // --- STEP 1: Capture 5 to 7 Photos ---
  console.log(`[SOS Media] Starting capture of ${photoCount} photos...`);
  for (let i = 0; i < photoCount; i++) {
    try {
      if (cameraRef.current.takePictureAsync) {
        const photo = await cameraRef.current.takePictureAsync({
          quality: 0.5, // Compressed for fast upload
          skipProcessing: true, // Speeds up consecutive photo captures
        });
        if (photo?.uri) {
          mediaResults.photos.push(photo.uri);
          console.log(`[SOS Media] Captured photo ${i + 1}/${photoCount}:`, photo.uri);
        }
      }
      // Pause between photos so hardware buffer clears
      await delay(450);
    } catch (err) {
      console.warn(`[SOS Media] Photo ${i + 1} capture failed:`, err?.message || err);
    }
  }

  // Pause before starting video
  await delay(500);

  // --- STEP 2: Record 8-10 Second Video Clip ---
  console.log('[SOS Media] Recording video clip...');
  try {
    if (cameraRef.current.recordAsync) {
      const videoPromise = cameraRef.current.recordAsync({
        maxDuration: 10, // Stops automatically after 10s
        quality: '480p',
      });

      const videoData = await videoPromise;
      if (videoData?.uri) {
        mediaResults.videoUri = videoData.uri;
        console.log('[SOS Media] Video recording saved:', videoData.uri);
      }
    }
  } catch (err) {
    console.warn('[SOS Media] Video recording failed:', err?.message || err);
  }

  // --- STEP 3: Record Audio Clip ---
  console.log('[SOS Media] Recording audio clip...');
  try {
    const audioPerm = await Audio.requestPermissionsAsync();
    if (audioPerm.status === 'granted') {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const recording = new Audio.Recording();
      await recording.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      await recording.startAsync();

      // Record audio for 8 seconds
      await delay(8000);

      await recording.stopAndUnloadAsync();
      mediaResults.audioUri = recording.getURI();
      console.log('[SOS Media] Audio recording saved:', mediaResults.audioUri);
    }
  } catch (err) {
    console.warn('[SOS Media] Audio recording failed:', err?.message || err);
  }

  return mediaResults;
}