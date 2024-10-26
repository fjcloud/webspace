let playlist = [];
let currentVideoIndex = 0;
let audioPlayer;

const PLAYLIST_START_TIME = new Date('2024-01-01T00:00:00Z').getTime();

async function loadPlaylist() {
    try {
        const response = await fetch('playlist.json');
        const data = await response.json();
        playlist = data.videos;
        console.log('Playlist loaded:', playlist);
    } catch (error) {
        console.error('Error loading playlist:', error);
    }
}

function getPlaylistDuration() {
    const lastVideo = playlist[playlist.length - 1];
    return lastVideo.start_time + lastVideo.duration;
}

function initializePlayer() {
    if (window.currentVideoTimeout) {
        clearTimeout(window.currentVideoTimeout);
    }

    synchronizePlayback();
    scheduleNextVideo();
}

function synchronizePlayback() {
    const now = new Date();
    const millisecondsSinceStart = now.getTime() - PLAYLIST_START_TIME;
    const secondsSinceStart = Math.floor(millisecondsSinceStart / 1000);
    
    const playlistDuration = getPlaylistDuration();
    const secondsIntoCurrentLoop = secondsSinceStart % playlistDuration;

    let videoToPlay = playlist[0];
    for (let i = 0; i < playlist.length; i++) {
        if (secondsIntoCurrentLoop >= playlist[i].start_time) {
            videoToPlay = playlist[i];
            currentVideoIndex = i;
        } else {
            break;
        }
    }

    const secondsIntoVideo = secondsIntoCurrentLoop - videoToPlay.start_time;
    
    const videoContainer = document.querySelector('.video-container');
    loadVideo(videoContainer, videoToPlay.id, secondsIntoVideo);
}

function scheduleNextVideo() {
    if (!playlist || playlist.length === 0) {
        console.error('Playlist is empty');
        return;
    }

    const now = new Date();
    const millisecondsSinceStart = now.getTime() - PLAYLIST_START_TIME;
    const secondsSinceStart = Math.floor(millisecondsSinceStart / 1000);

    const playlistDuration = getPlaylistDuration();
    const secondsIntoCurrentLoop = secondsSinceStart % playlistDuration;

    const currentVideo = playlist[currentVideoIndex];
    const currentVideoEndTime = currentVideo.start_time + currentVideo.duration;

    const timeUntilNext = (currentVideoEndTime - secondsIntoCurrentLoop) * 1000;

    if (timeUntilNext < 0) {
        console.log('Resynchronizing playback...');
        synchronizePlayback(); // Resynchronise avec le bon timing
        scheduleNextVideo();   // Replanifie le prochain changement
        return;
    }

    console.log(`Planning next video in ${timeUntilNext/1000} seconds`);

    const maxTimeout = Math.min(timeUntilNext, 2147483647);

    window.currentVideoTimeout = setTimeout(() => {
        playNextVideo();
        scheduleNextVideo();
    }, maxTimeout);
}

function loadVideo(container, videoId, startTime = 0) {
    // Remove any existing iframe
    const existingIframe = container.querySelector('iframe');
    if (existingIframe) {
        existingIframe.remove();
    }

    // Create a new iframe
    const iframe = document.createElement('iframe');
    iframe.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";
    iframe.allowFullscreen = true;

    const embedUrl = new URL('https://cdpn.io/pen/debug/oNPzxKo');
    embedUrl.searchParams.set('v', videoId);
    embedUrl.searchParams.set('autoplay', '1');
    embedUrl.searchParams.set('controls', '0');
    embedUrl.searchParams.set('mute', '1');
    embedUrl.searchParams.set('modestbranding', '1');
    embedUrl.searchParams.set('rel', '0');
    embedUrl.searchParams.set('showinfo', '0');
    embedUrl.searchParams.set('iv_load_policy', '3');
    embedUrl.searchParams.set('playsinline', '1');
    embedUrl.searchParams.set('enablejsapi', '1');
    embedUrl.searchParams.set('start', Math.floor(startTime).toString());

    iframe.src = embedUrl.toString();

    // Set iframe styles
    iframe.style.position = 'absolute';
    iframe.style.top = '0';
    iframe.style.left = '0';
    iframe.style.width = '100%';
    iframe.style.height = '100%';

    // Append the new iframe to the container
    container.appendChild(iframe);
}

function playNextVideo() {
    currentVideoIndex = (currentVideoIndex + 1) % playlist.length;
    const videoContainer = document.querySelector('.video-container');
    loadVideo(videoContainer, playlist[currentVideoIndex].id);
}

function setupAudioPlayer() {
    if (Hls.isSupported()) {
        audioPlayer = new Hls();
        audioPlayer.loadSource('https://stream.nightride.fm:8443/ebsm/ebsm.m3u8');
        audioPlayer.attachMedia(document.createElement('audio'));
        audioPlayer.on(Hls.Events.MANIFEST_PARSED, function() {
            console.log('HLS manifest loaded');
        });
    } else if (audio.canPlayType('application/vnd.apple.mpegurl')) {
        audioPlayer = document.createElement('audio');
        audioPlayer.src = 'https://stream.nightride.fm:8443/ebsm/ebsm.m3u8';
        audioPlayer.addEventListener('loadedmetadata', function() {
            console.log('HLS audio loaded');
        });
    } else {
        console.error('HLS is not supported on this browser');
    }
}

function startAudio() {
    if (audioPlayer instanceof Hls) {
        audioPlayer.media.play().catch(error => {
            console.log('Audio playback failed:', error);
        });
    } else if (audioPlayer instanceof HTMLAudioElement) {
        audioPlayer.play().catch(error => {
            console.log('Audio playback failed:', error);
        });
    }
}

function setupMetadataEventSource() {
    metadataEventSource = new EventSource('https://nightride.fm/meta');

    metadataEventSource.onmessage = function(event) {
        // Ignore keepalive messages
        if (event.data.trim() === 'keepalive') {
            console.log('Received keepalive message');
            return;
        }

        try {
            const data = JSON.parse(event.data);
            const ebsmData = data.find(item => item.station === 'ebsm');
            if (ebsmData) {
                updateMetadataDisplay(ebsmData);
            }
        } catch (error) {
            console.error('Error parsing metadata:', error);
            console.log('Received data:', event.data);
        }
    };

    metadataEventSource.onerror = function(error) {
        console.error('EventSource failed:', error);
        metadataEventSource.close();
        // Attempt to reconnect after a delay
        setTimeout(setupMetadataEventSource, 5000);
    };
}

function updateMetadataDisplay(metadata) {
    const metadataContainer = document.getElementById('stream-metadata');
    metadataContainer.innerHTML = `
        <p>Radio : nightride.fm</p>
        <p>Track : ${metadata.title}</p>
        <p>Artist: ${metadata.artist}</p>
    `;
}

document.addEventListener('DOMContentLoaded', async () => {
    await loadPlaylist();
    setupAudioPlayer();

    const startButton = document.getElementById('start-button');
    const metadataContainer = document.getElementById('stream-metadata');

    startButton.addEventListener('click', () => {
        initializePlayer();
        startAudio();
        startButton.style.display = 'none';
        metadataContainer.style.display = 'block'; // Show the metadata container
        setupMetadataEventSource();
    });
});
