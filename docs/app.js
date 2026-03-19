// Constants
const CONFIG = {
  PLAYLIST_START_TIME: new Date('2024-01-01T00:00:00Z').getTime(),
  RADIO_STREAM_URL: 'https://stream.nightride.fm:8443/ebsm/ebsm.m3u8',
  METADATA_URL: 'https://nightride.fm/meta',
  MAX_TIMEOUT: 2147483647, // Maximum safe timeout value
};

// Types (for documentation and IDE support)
/**
 * @typedef {Object} Video
 * @property {string} id
 * @property {number} start_time
 * @property {number} duration
 */

/**
 * @typedef {Object} RadioMetadata
 * @property {string} station
 * @property {string} title
 * @property {string} artist
 */

// Playlist Controller
class PlaylistController {
  constructor() {
    this.playlist = [];
    this.currentVideoIndex = 0;
    this.currentVideoTimeout = null;
  }

  async loadPlaylist() {
    try {
      const response = await fetch('playlist.json');
      const data = await response.json();
      this.playlist = data.videos;
      console.log('Playlist loaded:', this.playlist);
      return true;
    } catch (error) {
      console.error('Error loading playlist:', error);
      return false;
    }
  }

  getPlaylistDuration() {
    const lastVideo = this.playlist[this.playlist.length - 1];
    return lastVideo.start_time + lastVideo.duration;
  }

  getCurrentPlaybackInfo() {
    const now = new Date().getTime();
    const millisecondsSinceStart = now - CONFIG.PLAYLIST_START_TIME;
    const secondsSinceStart = Math.floor(millisecondsSinceStart / 1000);
    const playlistDuration = this.getPlaylistDuration();
    const secondsIntoCurrentLoop = secondsSinceStart % playlistDuration;

    let videoToPlay = this.playlist[0];
    for (let i = 0; i < this.playlist.length; i++) {
      if (secondsIntoCurrentLoop >= this.playlist[i].start_time) {
        videoToPlay = this.playlist[i];
        this.currentVideoIndex = i;
      } else {
        break;
      }
    }

    return {
      video: videoToPlay,
      secondsIntoVideo: secondsIntoCurrentLoop - videoToPlay.start_time,
      timeUntilNext: (videoToPlay.start_time + videoToPlay.duration - secondsIntoCurrentLoop) * 1000
    };
  }
}

// Video Player
class VideoPlayer {
  constructor(containerSelector) {
    this.container = document.querySelector(containerSelector);
    this.playerReadyPromises = new Map();
  }

  loadVideo(videoId, startTime = 0) {
    const existingWrapper = this.container.querySelector('.video-wrapper');
    if (existingWrapper) {
      existingWrapper.remove();
    }

    // Create wrapper
    const wrapper = document.createElement('div');
    wrapper.className = 'video-wrapper';

    const iframe = document.createElement('iframe');
    iframe.id = `youtube-player-${videoId}`;
    iframe.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";
    iframe.allowFullscreen = true;

    const embedUrl = new URL('https://cdpn.io/pen/debug/oNPzxKo');
    const params = {
      v: videoId,
      autoplay: '1',
      controls: '0',
      mute: '1',
      modestbranding: '1',
      rel: '0',
      showinfo: '0',
      iv_load_policy: '3',
      playsinline: '1',
      enablejsapi: '1',
      start: Math.floor(startTime).toString(),
      origin: window.location.origin,
      widget_referrer: window.location.origin,
      fs: '0',
      cc_load_policy: '0',
      annotations: '0',
      disablekb: '1',
    };

    Object.entries(params).forEach(([key, value]) => {
      embedUrl.searchParams.set(key, value);
    });

    iframe.src = embedUrl.toString();

    // Add elements to DOM
    wrapper.appendChild(iframe);
    this.container.appendChild(wrapper);

    // Handle iframe load
    iframe.addEventListener('load', () => {
      // Short delay to ensure styles are applied
      setTimeout(() => {
        wrapper.classList.add('ready');
      }, 100);
    });

    // Clean up old promises after delay
    setTimeout(() => {
      this.playerReadyPromises.delete(videoId);
    }, 10000);

    return new Promise((resolve) => {
      iframe.addEventListener('load', () => resolve());
    });
  }
}

// Audio Player
class AudioPlayer {
  constructor() {
    this.player = null;
  }

  setup() {
    if (Hls.isSupported()) {
      this.player = new Hls();
      this.player.loadSource(CONFIG.RADIO_STREAM_URL);
      const audioElement = document.createElement('audio');
      this.player.attachMedia(audioElement);
      this.player.on(Hls.Events.MANIFEST_PARSED, () => {
        console.log('HLS manifest loaded');
      });
    } else if (audio.canPlayType('application/vnd.apple.mpegurl')) {
      this.player = document.createElement('audio');
      this.player.src = CONFIG.RADIO_STREAM_URL;
      this.player.addEventListener('loadedmetadata', () => {
        console.log('HLS audio loaded');
      });
    } else {
      console.error('HLS is not supported on this browser');
    }
  }

  async start() {
    try {
      if (this.player instanceof Hls) {
        await this.player.media.play();
      } else if (this.player instanceof HTMLAudioElement) {
        await this.player.play();
      }
    } catch (error) {
      console.error('Audio playback failed:', error);
    }
  }
}

// Metadata Controller
class MetadataController {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.eventSource = null;
  }

  setupEventSource() {
    this.eventSource = new EventSource(CONFIG.METADATA_URL);

    this.eventSource.onmessage = (event) => {
      if (event.data.trim() === 'keepalive') {
        console.log('Received keepalive message');
        return;
      }

      try {
        const data = JSON.parse(event.data);
        const ebsmData = data.find(item => item.station === 'ebsm');
        if (ebsmData) {
          this.updateDisplay(ebsmData);
        }
      } catch (error) {
        console.error('Error parsing metadata:', error);
      }
    };

    this.eventSource.onerror = (error) => {
      console.error('EventSource failed:', error);
      this.eventSource.close();
      setTimeout(() => this.setupEventSource(), 5000);
    };
  }

  updateDisplay(metadata) {
    this.container.innerHTML = `
      <p>Radio : nightride.fm</p>
      <p>Track : ${metadata.title}</p>
      <p>Artist: ${metadata.artist}</p>
    `;
    this.lastMetadata = metadata;
    if (this.onUpdate) this.onUpdate(metadata);
  }

  show() {
    this.container.style.display = 'block';
  }
}

// Main Application
class App {
  constructor() {
    this.playlistController = new PlaylistController();
    this.videoPlayer = new VideoPlayer('.video-container');
    this.audioPlayer = new AudioPlayer();
    this.metadataController = new MetadataController('stream-metadata');
    this.isPlaying = false;
    this.pipWindow = null;
  }

  async initialize() {
    await this.playlistController.loadPlaylist();
    this.audioPlayer.setup();
    this.setupEventListeners();
  }

  setupEventListeners() {
    const startButton = document.getElementById('start-button');
    startButton.addEventListener('click', () => this.start());
  }

  start() {
    if (this.isPlaying) return;
    this.isPlaying = true;

    this.synchronizePlayback();
    this.scheduleNextVideo();
    this.audioPlayer.start();
    this.metadataController.show();
    this.metadataController.setupEventSource();
    this.metadataController.onUpdate = (m) => {
      const el = this.pipWindow?.document.getElementById('pip-meta');
      if (el) el.textContent = `${m.artist} — ${m.title}`;
    };

    document.getElementById('start-button').style.display = 'none';

    if ('documentPictureInPicture' in window) {
      const pipButton = document.getElementById('pip-button');
      pipButton.style.display = 'block';
      pipButton.addEventListener('click', () => this.togglePictureInPicture());
    }

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && this.isPlaying && !this.pipWindow) {
        this.synchronizePlayback();
        this.scheduleNextVideo();
      }
    });
  }

  async togglePictureInPicture() {
    if (this.pipWindow) {
      this.pipWindow.close();
      return;
    }

    document.getElementById('pip-button').disabled = true;

    const pipWindow = await documentPictureInPicture.requestWindow({
      width: 400,
      height: 300,
    });

    const style = pipWindow.document.createElement('style');
    style.textContent = `
      html, body { margin: 0; width: 100%; height: 100%; background: black; overflow: hidden; }
      .video-wrapper { width: 100%; height: 100%; position: relative; overflow: hidden; display: flex; align-items: center; justify-content: center; }
      .video-wrapper iframe { position: absolute; width: 133.333%; height: 133.333%; border: none; opacity: 0; transition: opacity 0.3s ease; pointer-events: none; }
      .video-wrapper.ready iframe { opacity: 1; }
      #pip-meta { position: fixed; bottom: 6px; left: 0; right: 0; text-align: center; font: 11px 'Roboto Mono', monospace; color: rgba(127,255,127,0.8); text-transform: uppercase; letter-spacing: 0.5px; text-shadow: 0 0 4px black; pointer-events: none; z-index: 1; }
    `;
    pipWindow.document.head.appendChild(style);

    const meta = pipWindow.document.createElement('div');
    meta.id = 'pip-meta';
    const m = this.metadataController.lastMetadata;
    if (m) meta.textContent = `${m.artist} — ${m.title}`;
    pipWindow.document.body.appendChild(meta);

    this.pipWindow = pipWindow;
    this.videoPlayer.container = pipWindow.document.body;
    this.synchronizePlayback();
    document.getElementById('pip-button').disabled = false;

    pipWindow.addEventListener('pagehide', () => {
      this.pipWindow = null;
      this.videoPlayer.container = document.querySelector('.video-container');
      this.synchronizePlayback();
      this.scheduleNextVideo();
    });
  }

  synchronizePlayback() {
    const { video, secondsIntoVideo } = this.playlistController.getCurrentPlaybackInfo();
    this.videoPlayer.loadVideo(video.id, secondsIntoVideo);
  }

  scheduleNextVideo() {
    if (this.playlistController.currentVideoTimeout) {
      clearTimeout(this.playlistController.currentVideoTimeout);
    }

    const { timeUntilNext } = this.playlistController.getCurrentPlaybackInfo();
    if (timeUntilNext < 0) {
      this.synchronizePlayback();
      this.scheduleNextVideo();
      return;
    }

    const timeout = Math.min(timeUntilNext, CONFIG.MAX_TIMEOUT);
    this.playlistController.currentVideoTimeout = setTimeout(() => {
      this.playNextVideo();
      this.scheduleNextVideo();
    }, timeout);
  }

  playNextVideo() {
    const nextIndex = (this.playlistController.currentVideoIndex + 1) % this.playlistController.playlist.length;
    this.playlistController.currentVideoIndex = nextIndex;
    this.videoPlayer.loadVideo(this.playlistController.playlist[nextIndex].id);
  }
}

// Application initialization
document.addEventListener('DOMContentLoaded', async () => {
  const app = new App();
  await app.initialize();
});
