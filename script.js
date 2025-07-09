class KaraokeApp {
    constructor() {
        this.audioPlayer = document.getElementById('audio-player');
        this.isPlaying = false;
        this.isPracticeMode = false;
        this.isRecording = false;
        this.lyrics = [];
        this.timedLyrics = [];
        this.currentLineIndex = 0;
        this.recordedChunks = [];
        this.mediaRecorder = null;
        this.recordedBlob = null;
        this.practiceTimer = null;
        this.currentPracticeStep = 'waiting'; // waiting, playing, recording, playback
        this.microphoneStream = null;
        this.savedSessions = JSON.parse(localStorage.getItem('karaokeSessions') || '[]');
        this.youtubePlayer = null;
        this.currentVideoId = null;
        this.isUsingYouTube = false;
        this.searchCache = new Map();
        this.lyricsCache = new Map();
        
        // Initialize CONFIG with fallback
        this.ensureConfig();
        
        this.initializeElements();
        this.setupEventListeners();
        this.requestMicrophonePermission();
        this.loadSavedSessions();
        this.initializeYouTubePlayer();
    }
    
    // Ensure CONFIG object exists with default values
    ensureConfig() {
        if (typeof window.CONFIG === 'undefined' || !window.CONFIG) {
            console.warn('CONFIG not loaded, using fallback configuration');
            window.CONFIG = {
                // API Keys (user needs to set these)
                YOUTUBE_API_KEY: 'YOUR_YOUTUBE_API_KEY_HERE',
                MUSIXMATCH_API_KEY: 'YOUR_MUSIXMATCH_API_KEY_HERE',
                
                // API URLs
                YOUTUBE_SEARCH_URL: 'https://www.googleapis.com/youtube/v3/search',
                MUSIXMATCH_SEARCH_URL: 'https://api.musixmatch.com/ws/1.1/track.search',
                MUSIXMATCH_LYRICS_URL: 'https://api.musixmatch.com/ws/1.1/track.lyrics.get',
                ITUNES_SEARCH_URL: 'https://itunes.apple.com/search',
                
                // Settings
                YOUTUBE_SEARCH_RESULTS: 5,
                MUSIXMATCH_SEARCH_RESULTS: 5,
                ITUNES_SEARCH_RESULTS: 5
            };
        }
        
        // Make CONFIG globally accessible
        window.CONFIG = window.CONFIG;
    }
    
    initializeElements() {
        this.elements = {
            youtubeUrl: document.getElementById('youtube-url'),
            loadUrlBtn: document.getElementById('load-url-btn'),
            songSearch: document.getElementById('song-search'),
            searchBtn: document.getElementById('search-btn'),
            searchResults: document.getElementById('search-results'),
            audioFile: document.getElementById('audio-file'),
            playBtn: document.getElementById('play-btn'),
            pauseBtn: document.getElementById('pause-btn'),
            stopBtn: document.getElementById('stop-btn'),
            progress: document.getElementById('progress'),
            currentTime: document.getElementById('current-time'),
            totalTime: document.getElementById('total-time'),
            songTitle: document.getElementById('song-title'),
            lyricsInput: document.getElementById('lyrics-input'),
            setLyricsBtn: document.getElementById('set-lyrics-btn'),
            syncLyricsBtn: document.getElementById('sync-lyrics-btn'),
            lyricsDisplay: document.getElementById('lyrics-display'),
            startPracticeBtn: document.getElementById('start-practice-btn'),
            stopPracticeBtn: document.getElementById('stop-practice-btn'),
            practiceStatusText: document.getElementById('practice-status-text'),
            saveSessionBtn: document.getElementById('save-session-btn'),
            sessionSelect: document.getElementById('session-select'),
            loadSessionBtn: document.getElementById('load-session-btn'),
            recordBtn: document.getElementById('record-btn'),
            stopRecordBtn: document.getElementById('stop-record-btn'),
            playRecordBtn: document.getElementById('play-record-btn'),
            recordingStatusText: document.getElementById('recording-status-text')
        };
    }
    
    setupEventListeners() {
        // YouTube URL functionality
        this.elements.loadUrlBtn.addEventListener('click', () => this.loadYouTubeURL());
        this.elements.youtubeUrl.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.loadYouTubeURL();
        });
        // Remove auto-load on paste - let user manually click the button
        
        // Search functionality (backup)
        this.elements.searchBtn.addEventListener('click', () => this.searchSongs());
        this.elements.songSearch.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.searchSongs();
        });
        
        // Add debug functionality (remove in production)
        if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
            console.log('Debug mode enabled');
            window.debugKaraoke = {
                testSearch: (query) => this.searchSongs.call({...this, elements: {...this.elements, songSearch: {value: query}}}),
                testConfig: () => console.log('CONFIG:', CONFIG)
            };
        }
        
        // Audio file selection
        this.elements.audioFile.addEventListener('change', (e) => this.loadAudioFile(e));
        
        // Audio controls
        this.elements.playBtn.addEventListener('click', () => this.playAudio());
        this.elements.pauseBtn.addEventListener('click', () => this.pauseAudio());
        this.elements.stopBtn.addEventListener('click', () => this.stopAudio());
        
        // Audio player events
        this.audioPlayer.addEventListener('loadedmetadata', () => this.updateTimeDisplay());
        this.audioPlayer.addEventListener('timeupdate', () => this.updateProgress());
        this.audioPlayer.addEventListener('ended', () => this.handleAudioEnded());
        
        // Lyrics
        this.elements.setLyricsBtn.addEventListener('click', () => this.setLyrics());
        this.elements.syncLyricsBtn.addEventListener('click', () => this.startLyricsSync());
        
        // Practice mode
        this.elements.startPracticeBtn.addEventListener('click', () => this.startPractice());
        this.elements.stopPracticeBtn.addEventListener('click', () => this.stopPractice());
        
        // Session management
        this.elements.saveSessionBtn.addEventListener('click', () => this.saveSession());
        this.elements.loadSessionBtn.addEventListener('click', () => this.loadSelectedSession());
        this.elements.sessionSelect.addEventListener('change', () => this.updateLoadButton());
        
        // Recording
        this.elements.recordBtn.addEventListener('click', () => this.startRecording());
        this.elements.stopRecordBtn.addEventListener('click', () => this.stopRecording());
        this.elements.playRecordBtn.addEventListener('click', () => this.playRecording());
    }
    
    async requestMicrophonePermission() {
        try {
            this.microphoneStream = await navigator.mediaDevices.getUserMedia({ 
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                }
            });
            // Don't stop the stream, keep it for recording
            this.elements.recordingStatusText.textContent = '録音準備完了';
        } catch (error) {
            console.error('Microphone access denied:', error);
            this.elements.recordingStatusText.textContent = 'マイクへのアクセスが拒否されました';
            this.elements.recordBtn.disabled = true;
        }
    }
    
    loadAudioFile(event) {
        const file = event.target.files[0];
        if (file) {
            const url = URL.createObjectURL(file);
            this.audioPlayer.src = url;
            this.elements.songTitle.textContent = file.name;
            this.elements.playBtn.disabled = false;
            this.elements.pauseBtn.disabled = false;
            this.elements.stopBtn.disabled = false;
            this.updatePracticeAvailability();
        }
    }
    
    playAudio() {
        if (!this.isPracticeMode) {
            this.audioPlayer.play();
            this.isPlaying = true;
        }
    }
    
    pauseAudio() {
        if (!this.isPracticeMode) {
            this.audioPlayer.pause();
            this.isPlaying = false;
        }
    }
    
    stopAudio() {
        if (!this.isPracticeMode) {
            this.audioPlayer.pause();
            this.audioPlayer.currentTime = 0;
            this.isPlaying = false;
        }
    }
    
    updateTimeDisplay() {
        if (this.audioPlayer.duration) {
            this.elements.totalTime.textContent = this.formatTime(this.audioPlayer.duration);
        }
    }
    
    updateProgress() {
        if (this.audioPlayer.duration) {
            const progress = (this.audioPlayer.currentTime / this.audioPlayer.duration) * 100;
            this.elements.progress.style.width = progress + '%';
            this.elements.currentTime.textContent = this.formatTime(this.audioPlayer.currentTime);
        }
    }
    
    handleAudioEnded() {
        this.isPlaying = false;
        if (this.isPracticeMode && this.currentPracticeStep === 'playing') {
            this.handlePracticeLineComplete();
        }
    }
    
    formatTime(seconds) {
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = Math.floor(seconds % 60);
        return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
    }
    
    setLyrics() {
        const lyricsText = this.elements.lyricsInput.value.trim();
        if (lyricsText) {
            this.lyrics = lyricsText.split('\n').filter(line => line.trim() !== '');
            this.timedLyrics = []; // Reset timed lyrics when setting new lyrics
            this.updateLyricsDisplay();
            this.updatePracticeAvailability();
        }
    }
    
    displayLyrics() {
        this.elements.lyricsDisplay.innerHTML = '';
        this.lyrics.forEach((line, index) => {
            const lineElement = document.createElement('div');
            lineElement.className = 'lyrics-line';
            lineElement.textContent = line;
            lineElement.setAttribute('data-index', index);
            
            // Add click handler for phrase playback
            lineElement.addEventListener('click', () => this.playPhraseAt(index));
            
            this.elements.lyricsDisplay.appendChild(lineElement);
        });
    }
    
    updatePracticeAvailability() {
        const hasAudio = this.audioPlayer.src !== '' || this.currentVideoId || this.elements.songTitle.textContent !== '楽曲を選択してください';
        const hasLyrics = this.lyrics.length > 0;
        this.elements.startPracticeBtn.disabled = !(hasAudio && hasLyrics);
        this.elements.saveSessionBtn.disabled = !(hasAudio && hasLyrics);
        this.elements.syncLyricsBtn.disabled = !(hasAudio && hasLyrics);
        
        if (hasAudio && hasLyrics) {
            this.elements.practiceStatusText.textContent = '練習を開始できます';
        } else if (!hasAudio) {
            this.elements.practiceStatusText.textContent = '楽曲を選択してください';
        } else if (!hasLyrics) {
            this.elements.practiceStatusText.textContent = '歌詞を入力してください';
        }
    }
    
    startPractice() {
        this.isPracticeMode = true;
        this.currentLineIndex = 0;
        this.elements.startPracticeBtn.disabled = true;
        this.elements.stopPracticeBtn.disabled = false;
        this.elements.recordBtn.disabled = false;
        this.elements.playBtn.disabled = true;
        this.elements.pauseBtn.disabled = true;
        this.elements.stopBtn.disabled = true;
        
        this.audioPlayer.currentTime = 0;
        this.highlightCurrentLine();
        this.startPracticeLine();
    }
    
    stopPractice() {
        this.isPracticeMode = false;
        this.currentPracticeStep = 'waiting';
        this.elements.startPracticeBtn.disabled = false;
        this.elements.stopPracticeBtn.disabled = true;
        this.elements.recordBtn.disabled = true;
        this.elements.stopRecordBtn.disabled = true;
        this.elements.playBtn.disabled = false;
        this.elements.pauseBtn.disabled = false;
        this.elements.stopBtn.disabled = false;
        
        this.pausePracticeAudio();
        this.clearLyricsHighlight();
        this.elements.practiceStatusText.textContent = '練習を停止しました';
        
        if (this.practiceTimer) {
            clearTimeout(this.practiceTimer);
            this.practiceTimer = null;
        }
    }
    
    startPracticeLine() {
        if (this.currentLineIndex >= this.lyrics.length) {
            this.completePractice();
            return;
        }
        
        this.currentPracticeStep = 'playing';
        this.elements.practiceStatusText.textContent = `${this.currentLineIndex + 1}行目を再生中...`;
        
        // Play the current line for approximately 5 seconds
        this.playPracticeAudio();
        this.practiceTimer = setTimeout(() => {
            this.handlePracticeLineComplete();
        }, 5000);
    }
    
    playPracticeAudio() {
        if (this.isUsingYouTube && this.youtubePlayer && this.youtubePlayer.playVideo) {
            this.youtubePlayer.playVideo();
            this.isPlaying = true;
            this.startProgressUpdate();
        } else if (this.audioPlayer.src) {
            this.audioPlayer.play();
            this.isPlaying = true;
        } else {
            // Fallback for sample data without actual audio
            console.log('Playing sample audio (no actual audio source)');
            this.isPlaying = true;
        }
    }
    
    pausePracticeAudio() {
        if (this.isUsingYouTube && this.youtubePlayer && this.youtubePlayer.pauseVideo) {
            this.youtubePlayer.pauseVideo();
        } else if (this.audioPlayer.src) {
            this.audioPlayer.pause();
        }
        this.isPlaying = false;
    }
    
    handlePracticeLineComplete() {
        if (this.practiceTimer) {
            clearTimeout(this.practiceTimer);
            this.practiceTimer = null;
        }
        
        this.pausePracticeAudio();
        this.currentPracticeStep = 'recording';
        this.elements.practiceStatusText.textContent = '録音ボタンを押して歌ってください';
        this.elements.recordBtn.disabled = false;
    }
    
    completePractice() {
        this.elements.practiceStatusText.textContent = '練習完了！お疲れ様でした。';
        this.stopPractice();
    }
    
    highlightCurrentLine() {
        this.clearLyricsHighlight();
        const lineElements = this.elements.lyricsDisplay.querySelectorAll('.lyrics-line');
        
        lineElements.forEach((element, index) => {
            if (index < this.currentLineIndex) {
                element.classList.add('completed');
            } else if (index === this.currentLineIndex) {
                element.classList.add('current');
            }
        });
    }
    
    clearLyricsHighlight() {
        const lineElements = this.elements.lyricsDisplay.querySelectorAll('.lyrics-line');
        lineElements.forEach(element => {
            element.classList.remove('current', 'completed');
        });
    }
    
    async startRecording() {
        if (!this.microphoneStream) {
            await this.requestMicrophonePermission();
        }
        
        if (!this.microphoneStream) {
            this.elements.recordingStatusText.textContent = 'マイクへのアクセスが必要です';
            return;
        }
        
        try {
            // Create a new MediaRecorder with improved codec support
            let options = {};
            if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
                options = { mimeType: 'audio/webm;codecs=opus' };
            } else if (MediaRecorder.isTypeSupported('audio/webm')) {
                options = { mimeType: 'audio/webm' };
            } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
                options = { mimeType: 'audio/mp4' };
            }
            
            this.mediaRecorder = new MediaRecorder(this.microphoneStream, options);
            this.recordedChunks = [];
            
            this.mediaRecorder.addEventListener('dataavailable', (event) => {
                if (event.data.size > 0) {
                    this.recordedChunks.push(event.data);
                }
            });
            
            this.mediaRecorder.addEventListener('stop', () => {
                this.recordedBlob = new Blob(this.recordedChunks, { type: options.mimeType || 'audio/webm' });
                this.elements.playRecordBtn.disabled = false;
                this.elements.recordingStatusText.textContent = '録音完了 - 再生ボタンで確認できます';
                if (this.isPracticeMode) {
                    this.currentPracticeStep = 'playback';
                    this.elements.practiceStatusText.textContent = '録音を再生して確認してください';
                }
            });
            
            this.mediaRecorder.start();
            this.isRecording = true;
            this.elements.recordBtn.disabled = true;
            this.elements.stopRecordBtn.disabled = false;
            this.elements.recordingStatusText.textContent = '録音中...';
            this.elements.recordingStatusText.classList.add('recording');
            
            // Add visual feedback to microphone icon
            const micIcon = this.elements.recordBtn.querySelector('.mic-icon');
            if (micIcon) {
                micIcon.classList.add('recording');
            }
            this.elements.recordBtn.classList.add('recording');
            
        } catch (error) {
            console.error('Recording failed:', error);
            this.elements.recordingStatusText.textContent = '録音に失敗しました: ' + error.message;
        }
    }
    
    stopRecording() {
        if (this.mediaRecorder && this.isRecording) {
            this.mediaRecorder.stop();
            this.isRecording = false;
            this.elements.recordBtn.disabled = false;
            this.elements.stopRecordBtn.disabled = true;
            this.elements.recordingStatusText.classList.remove('recording');
            
            // Remove visual feedback from microphone icon
            const micIcon = this.elements.recordBtn.querySelector('.mic-icon');
            if (micIcon) {
                micIcon.classList.remove('recording');
            }
            this.elements.recordBtn.classList.remove('recording');
        }
    }
    
    playRecording() {
        if (this.recordedBlob) {
            const audioUrl = URL.createObjectURL(this.recordedBlob);
            const recordedAudio = new Audio(audioUrl);
            
            recordedAudio.addEventListener('ended', () => {
                if (this.isPracticeMode) {
                    this.moveToNextLine();
                }
            });
            
            recordedAudio.play();
            this.elements.recordingStatusText.textContent = '録音再生中...';
        }
    }
    
    moveToNextLine() {
        this.currentLineIndex++;
        this.highlightCurrentLine();
        
        if (this.currentLineIndex >= this.lyrics.length) {
            this.completePractice();
        } else {
            this.elements.recordBtn.disabled = true;
            this.elements.playRecordBtn.disabled = true;
            this.elements.recordingStatusText.textContent = '録音準備完了';
            
            // Wait 2 seconds before starting next line
            setTimeout(() => {
                this.startPracticeLine();
            }, 2000);
        }
    }
    
    // Song search functionality
    async searchSongs() {
        const query = this.elements.songSearch.value.trim();
        if (!query) return;
        
        this.elements.searchResults.innerHTML = '<div class="search-result-item">検索中...</div>';
        
        try {
            // Check cache first
            const cacheKey = query.toLowerCase();
            if (this.searchCache.has(cacheKey)) {
                this.displaySearchResults(this.searchCache.get(cacheKey));
                return;
            }
            
            // Search from multiple sources with individual error handling
            const searchPromises = [
                this.searchiTunes(query).catch(error => {
                    console.error('iTunes search error:', error);
                    return [];
                }),
                this.searchYouTube(query).catch(error => {
                    console.error('YouTube search error:', error);
                    return [];
                })
            ];
            
            const results = await Promise.allSettled(searchPromises);
            const successfulResults = results
                .filter(result => result.status === 'fulfilled')
                .map(result => result.value)
                .flat();
            
            const combinedResults = this.combineSearchResults(successfulResults);
            
            if (combinedResults.length > 0) {
                this.searchCache.set(cacheKey, combinedResults);
                this.displaySearchResults(combinedResults);
            } else {
                // Fuzzy search as fallback
                try {
                    const fuzzyResults = await this.fuzzySearch(query);
                    if (fuzzyResults.length > 0) {
                        this.displaySearchResults(fuzzyResults, true);
                    } else {
                        this.showNoResults();
                    }
                } catch (fuzzyError) {
                    console.error('Fuzzy search error:', fuzzyError);
                    this.showNoResults();
                }
            }
        } catch (error) {
            console.error('Search error:', error);
            this.showSearchError(error.message);
        }
    }
    
    showNoResults() {
        this.elements.searchResults.innerHTML = `
            <div class="search-result-item no-results">
                <div style="text-align: center; padding: 20px;">
                    <div style="font-size: 24px; margin-bottom: 10px;">🔍</div>
                    <div><strong>検索結果が見つかりませんでした</strong></div>
                    <div style="color: #666; font-size: 14px; margin-top: 5px;">
                        別のキーワードで検索してみてください
                    </div>
                </div>
            </div>
        `;
    }
    
    showSearchError(message) {
        this.elements.searchResults.innerHTML = `
            <div class="search-result-item error-message">
                <div style="text-align: center; padding: 20px;">
                    <div style="font-size: 24px; margin-bottom: 10px;">⚠️</div>
                    <div><strong>検索中にエラーが発生しました</strong></div>
                    <div style="color: #666; font-size: 14px; margin-top: 5px;">
                        ${message || 'しばらく時間をおいて再度お試しください'}
                    </div>
                </div>
            </div>
        `;
    }
    
    displaySearchResults(results, isFuzzy = false) {
        this.elements.searchResults.innerHTML = '';
        
        if (isFuzzy && results.length > 0) {
            const fuzzyHeader = document.createElement('div');
            fuzzyHeader.className = 'search-fuzzy-header';
            fuzzyHeader.textContent = 'もしかして以下の楽曲をお探しですか？';
            this.elements.searchResults.appendChild(fuzzyHeader);
        }
        
        results.forEach(result => {
            const resultItem = document.createElement('div');
            resultItem.className = 'search-result-item';
            
            const thumbnail = result.thumbnail || result.artwork;
            const sourceIcon = result.source === 'YouTube' ? '🎬' : '🎵';
            
            resultItem.innerHTML = `
                <div class="result-content">
                    ${thumbnail ? `<img src="${thumbnail}" alt="thumbnail" class="result-thumbnail">` : ''}
                    <div class="result-info">
                        <div class="result-title">${this.highlightSearchTerm(result.title)}</div>
                        <div class="result-artist">${this.highlightSearchTerm(result.artist)}</div>
                        <div class="result-meta">
                            <span class="result-duration">${result.duration}</span>
                            <span class="result-source">${sourceIcon} ${result.source}</span>
                        </div>
                    </div>
                </div>
            `;
            
            resultItem.addEventListener('click', () => this.selectSong(result));
            this.elements.searchResults.appendChild(resultItem);
        });
    }
    
    highlightSearchTerm(text) {
        const query = this.elements.songSearch.value.trim().toLowerCase();
        if (!query) return text;
        
        const regex = new RegExp(`(${query})`, 'gi');
        return text.replace(regex, '<mark>$1</mark>');
    }
    
    async selectSong(song) {
        this.elements.songTitle.textContent = `${song.title} - ${song.artist}`;
        this.elements.searchResults.innerHTML = '';
        this.elements.songSearch.value = '';
        
        // Load YouTube video if available
        if (song.videoId) {
            this.loadYouTubeVideo(song.videoId);
            this.isUsingYouTube = true;
        } else if (song.previewUrl) {
            this.loadAudioFromUrl(song.previewUrl);
            this.isUsingYouTube = false;
        } else if (song.source === 'Sample') {
            // For sample data, enable controls without actual audio
            this.elements.playBtn.disabled = false;
            this.elements.pauseBtn.disabled = false;
            this.elements.stopBtn.disabled = false;
            this.isUsingYouTube = false;
        }
        
        // Search for lyrics automatically
        await this.searchAndLoadLyrics(song.title, song.artist);
        
        this.updatePracticeAvailability();
    }
    
    // loadLyricsFromSample removed - no more demo mode
    
    // Lyrics synchronization
    startLyricsSync() {
        if (!this.audioPlayer.src || this.lyrics.length === 0) {
            alert('楽曲と歌詞を準備してください');
            return;
        }
        
        this.isLyricsSyncing = true;
        this.currentSyncIndex = 0;
        this.timedLyrics = [];
        
        this.elements.syncLyricsBtn.disabled = true;
        this.elements.syncLyricsBtn.textContent = '同期中...';
        
        this.syncCurrentLine();
    }
    
    syncCurrentLine() {
        if (this.currentSyncIndex >= this.lyrics.length) {
            this.completeLyricsSync();
            return;
        }
        
        const currentLine = this.lyrics[this.currentSyncIndex];
        const message = `"${currentLine}"\n\nこの歌詞の歌い始めまで楽曲を進めて、準備ができたらOKを押してください。`;
        
        if (confirm(message)) {
            const currentTime = this.audioPlayer.currentTime;
            this.timedLyrics.push({
                text: currentLine,
                time: currentTime,
                index: this.currentSyncIndex
            });
            
            this.currentSyncIndex++;
            this.syncCurrentLine();
        } else {
            this.cancelLyricsSync();
        }
    }
    
    completeLyricsSync() {
        this.isLyricsSyncing = false;
        this.elements.syncLyricsBtn.disabled = false;
        this.elements.syncLyricsBtn.textContent = '歌詞同期';
        
        alert('歌詞の同期が完了しました！');
        this.updateLyricsDisplay();
    }
    
    cancelLyricsSync() {
        this.isLyricsSyncing = false;
        this.elements.syncLyricsBtn.disabled = false;
        this.elements.syncLyricsBtn.textContent = '歌詞同期';
        this.timedLyrics = [];
    }
    
    updateLyricsDisplay() {
        this.elements.lyricsDisplay.innerHTML = '';
        this.lyrics.forEach((line, index) => {
            const lineElement = document.createElement('div');
            lineElement.className = 'lyrics-line';
            lineElement.textContent = line;
            lineElement.setAttribute('data-index', index);
            
            // Add time info if available
            const timedLyric = this.timedLyrics.find(tl => tl.index === index);
            if (timedLyric) {
                lineElement.title = `時間: ${this.formatTime(timedLyric.time)}`;
            }
            
            // Add click handler for phrase playback
            lineElement.addEventListener('click', () => this.playPhraseAt(index));
            
            this.elements.lyricsDisplay.appendChild(lineElement);
        });
    }
    
    // Phrase playback functionality
    playPhraseAt(index) {
        if (!this.audioPlayer.src && !this.isUsingYouTube) {
            alert('楽曲を選択してください');
            return;
        }
        
        const timedLyric = this.timedLyrics.find(tl => tl.index === index);
        if (timedLyric) {
            // Start playback 1 second before the vocal
            const startTime = Math.max(0, timedLyric.time - 1);
            
            if (this.isUsingYouTube && this.youtubePlayer && this.youtubePlayer.seekTo) {
                this.youtubePlayer.seekTo(startTime);
                this.youtubePlayer.playVideo();
            } else if (this.audioPlayer.src) {
                this.audioPlayer.currentTime = startTime;
                this.audioPlayer.play();
            }
            
            // Highlight the selected line
            this.highlightLine(index);
            
            if (this.phrasePlaybackTimer) {
                clearTimeout(this.phrasePlaybackTimer);
            }
            
            const nextTimed = this.timedLyrics.find(tl => tl.index === index + 1);
            const playDuration = nextTimed ? 
                (nextTimed.time - timedLyric.time + 1) * 1000 : 
                8000; // 8 seconds default
            
            this.phrasePlaybackTimer = setTimeout(() => {
                this.pausePracticeAudio();
                this.clearLyricsHighlight();
            }, playDuration);
        } else {
            // If no timing info, just play from current position
            if (this.isUsingYouTube && this.youtubePlayer && this.youtubePlayer.playVideo) {
                this.youtubePlayer.playVideo();
            } else if (this.audioPlayer.src) {
                this.audioPlayer.play();
            }
            
            this.highlightLine(index);
            
            // Stop after 8 seconds
            if (this.phrasePlaybackTimer) {
                clearTimeout(this.phrasePlaybackTimer);
            }
            
            this.phrasePlaybackTimer = setTimeout(() => {
                this.pausePracticeAudio();
                this.clearLyricsHighlight();
            }, 8000);
        }
    }
    
    highlightLine(index) {
        this.clearLyricsHighlight();
        const lineElements = this.elements.lyricsDisplay.querySelectorAll('.lyrics-line');
        if (lineElements[index]) {
            lineElements[index].classList.add('current');
        }
    }
    
    // Session saving functionality
    saveSession() {
        if (!this.audioPlayer.src || this.lyrics.length === 0) {
            alert('楽曲と歌詞が必要です');
            return;
        }
        
        const sessionName = prompt('セッション名を入力してください:');
        if (!sessionName) return;
        
        const session = {
            name: sessionName,
            songTitle: this.elements.songTitle.textContent,
            lyrics: this.lyrics,
            timedLyrics: this.timedLyrics,
            timestamp: new Date().toISOString()
        };
        
        this.savedSessions.push(session);
        localStorage.setItem('karaokeSessions', JSON.stringify(this.savedSessions));
        
        alert('セッションが保存されました！');
    }
    
    loadSession(sessionName) {
        const session = this.savedSessions.find(s => s.name === sessionName);
        if (!session) return;
        
        this.lyrics = session.lyrics;
        this.timedLyrics = session.timedLyrics || [];
        this.elements.songTitle.textContent = session.songTitle;
        this.elements.lyricsInput.value = session.lyrics.join('\n');
        
        this.updateLyricsDisplay();
        this.updatePracticeAvailability();
    }
    
    // Session management UI methods
    loadSavedSessions() {
        this.elements.sessionSelect.innerHTML = '<option value="">保存されたセッションを選択</option>';
        this.savedSessions.forEach(session => {
            const option = document.createElement('option');
            option.value = session.name;
            option.textContent = `${session.name} (${new Date(session.timestamp).toLocaleDateString()})`;
            this.elements.sessionSelect.appendChild(option);
        });
        this.updateLoadButton();
    }
    
    updateLoadButton() {
        const selectedSession = this.elements.sessionSelect.value;
        this.elements.loadSessionBtn.disabled = !selectedSession;
    }
    
    loadSelectedSession() {
        const selectedSession = this.elements.sessionSelect.value;
        if (selectedSession) {
            this.loadSession(selectedSession);
            alert(`セッション "${selectedSession}" を読み込みました！`);
        }
    }
    
    // API Configuration Check (removed - no more demo mode warnings)
    
    // YouTube Player Integration
    initializeYouTubePlayer() {
        window.onYouTubeIframeAPIReady = () => {
            this.youtubePlayer = new YT.Player('youtube-player', {
                height: '0',
                width: '0',
                playerVars: {
                    'playsinline': 1,
                    'controls': 0,
                    'disablekb': 1,
                    'fs': 0,
                    'modestbranding': 1
                },
                events: {
                    'onReady': (event) => {
                        console.log('YouTube player ready');
                    },
                    'onStateChange': (event) => {
                        this.handleYouTubeStateChange(event);
                    }
                }
            });
        };
    }
    
    handleYouTubeStateChange(event) {
        if (event.data === YT.PlayerState.PLAYING) {
            this.isPlaying = true;
            this.startProgressUpdate();
        } else if (event.data === YT.PlayerState.PAUSED) {
            this.isPlaying = false;
        } else if (event.data === YT.PlayerState.ENDED) {
            this.isPlaying = false;
            this.handleAudioEnded();
        }
    }
    
    loadYouTubeVideo(videoId) {
        if (this.youtubePlayer && this.youtubePlayer.loadVideoById) {
            this.youtubePlayer.loadVideoById(videoId);
            this.currentVideoId = videoId;
            this.elements.playBtn.disabled = false;
            this.elements.pauseBtn.disabled = false;
            this.elements.stopBtn.disabled = false;
        }
    }
    
    loadAudioFromUrl(url) {
        this.audioPlayer.src = url;
        this.isUsingYouTube = false;
        this.elements.playBtn.disabled = false;
        this.elements.pauseBtn.disabled = false;
        this.elements.stopBtn.disabled = false;
    }
    
    startProgressUpdate() {
        if (this.progressUpdateInterval) {
            clearInterval(this.progressUpdateInterval);
        }
        
        this.progressUpdateInterval = setInterval(() => {
            if (this.isUsingYouTube && this.youtubePlayer && this.youtubePlayer.getCurrentTime) {
                const currentTime = this.youtubePlayer.getCurrentTime();
                const duration = this.youtubePlayer.getDuration();
                this.updateProgressDisplay(currentTime, duration);
                this.updateLyricsHighlight(currentTime);
            }
        }, 100);
    }
    
    updateProgressDisplay(currentTime, duration) {
        if (duration > 0) {
            const progress = (currentTime / duration) * 100;
            this.elements.progress.style.width = progress + '%';
            this.elements.currentTime.textContent = this.formatTime(currentTime);
            this.elements.totalTime.textContent = this.formatTime(duration);
        }
    }
    
    updateLyricsHighlight(currentTime) {
        if (this.timedLyrics.length === 0) return;
        
        let currentLineIndex = -1;
        for (let i = 0; i < this.timedLyrics.length; i++) {
            if (currentTime >= this.timedLyrics[i].time) {
                currentLineIndex = i;
            } else {
                break;
            }
        }
        
        if (currentLineIndex !== this.lastHighlightedIndex) {
            this.highlightLyricsLine(currentLineIndex);
            this.lastHighlightedIndex = currentLineIndex;
        }
    }
    
    highlightLyricsLine(index) {
        const lineElements = this.elements.lyricsDisplay.querySelectorAll('.lyrics-line');
        lineElements.forEach((element, i) => {
            element.classList.remove('current', 'completed');
            if (i < index) {
                element.classList.add('completed');
            } else if (i === index) {
                element.classList.add('current');
            }
        });
    }
    
    // YouTube API Search
    async searchYouTube(query) {
        // Skip if API key is not configured
        if (!CONFIG?.YOUTUBE_API_KEY || CONFIG.YOUTUBE_API_KEY === 'YOUR_YOUTUBE_API_KEY_HERE') {
            console.log('YouTube API key not configured, skipping YouTube search');
            return [];
        }
        
        try {
            const searchQuery = encodeURIComponent(query + ' karaoke');
            const url = `${CONFIG.YOUTUBE_SEARCH_URL}?part=snippet&q=${searchQuery}&type=video&maxResults=${CONFIG.YOUTUBE_SEARCH_RESULTS}&key=${CONFIG.YOUTUBE_API_KEY}`;
            
            // Add timeout to fetch request
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
            
            const response = await fetch(url, {
                signal: controller.signal,
                headers: {
                    'Accept': 'application/json',
                }
            });
            
            clearTimeout(timeoutId);
            
            if (!response.ok) {
                throw new Error(`YouTube API error: ${response.status} ${response.statusText}`);
            }
            
            const data = await response.json();
            
            if (data.error) {
                throw new Error(`YouTube API error: ${data.error.message}`);
            }
            
            if (data.items && Array.isArray(data.items)) {
                return data.items.map(item => ({
                    title: this.cleanTitle(item.snippet.title),
                    artist: item.snippet.channelTitle,
                    duration: 'YouTube',
                    videoId: item.id.videoId,
                    thumbnail: item.snippet.thumbnails?.default?.url,
                    source: 'YouTube'
                })).filter(item => item.title && item.artist);
            }
            
            return [];
        } catch (error) {
            if (error.name === 'AbortError') {
                console.error('YouTube search timeout');
            } else {
                console.error('YouTube search error:', error.message);
            }
            return [];
        }
    }
    
    // Clean up video titles
    cleanTitle(title) {
        if (!title) return '';
        return title
            .replace(/\s*\(.*?\)|\s*\[.*?\]/g, '') // Remove parentheses and brackets
            .replace(/\s*-\s*(official|music|video|mv|pv|karaoke|lyrics).*$/i, '') // Remove common suffixes
            .replace(/\s*(official|music|video|mv|pv|karaoke|lyrics)\s*/gi, ' ') // Remove common words
            .replace(/\s+/g, ' ') // Replace multiple spaces with single space
            .trim();
    }
    
    // iTunes API Search
    async searchiTunes(query) {
        try {
            const searchTerm = encodeURIComponent(query);
            const url = `${CONFIG.ITUNES_SEARCH_URL}?term=${searchTerm}&media=music&entity=song&limit=${CONFIG.ITUNES_SEARCH_RESULTS}&country=JP`;
            
            // Add timeout to fetch request
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 8000); // 8 second timeout
            
            const response = await fetch(url, {
                signal: controller.signal,
                method: 'GET',
                headers: {
                    'Accept': 'application/json',
                },
                mode: 'cors' // Explicitly set CORS mode
            });
            
            clearTimeout(timeoutId);
            
            if (!response.ok) {
                throw new Error(`iTunes API error: ${response.status} ${response.statusText}`);
            }
            
            const data = await response.json();
            
            if (data.results && Array.isArray(data.results)) {
                return data.results
                    .filter(item => item.trackName && item.artistName) // Filter out items without required fields
                    .map(item => ({
                        title: item.trackName,
                        artist: item.artistName,
                        duration: item.trackTimeMillis ? this.formatTime(item.trackTimeMillis / 1000) : 'Unknown',
                        previewUrl: item.previewUrl,
                        artwork: item.artworkUrl100,
                        source: 'iTunes',
                        genre: item.primaryGenreName
                    }))
                    .slice(0, CONFIG.ITUNES_SEARCH_RESULTS); // Ensure we don't exceed the limit
            }
            
            return [];
        } catch (error) {
            if (error.name === 'AbortError') {
                console.error('iTunes search timeout');
            } else if (error.message.includes('CORS')) {
                console.error('iTunes CORS error - this is expected in some browsers');
            } else {
                console.error('iTunes search error:', error.message);
            }
            return [];
        }
    }
    
    // Combine and deduplicate search results
    combineSearchResults(results) {
        const seen = new Set();
        const combined = [];
        
        for (const result of results) {
            const key = `${result.title.toLowerCase()}-${result.artist.toLowerCase()}`;
            if (!seen.has(key)) {
                seen.add(key);
                combined.push(result);
            }
        }
        
        return combined.slice(0, 8); // Limit to 8 results
    }
    
    // Fuzzy search for better results
    async fuzzySearch(query) {
        try {
            // Generate fuzzy search variations
            const fuzzyQueries = [
                query.replace(/\s+/g, ''), // Remove spaces
                query.split(' ').reverse().join(' '), // Reverse word order
                query.replace(/[^\w\s]/gi, ''), // Remove special characters
                query.split(' ')[0], // First word only
                query.replace(/\d+/g, '').trim() // Remove numbers
            ].filter(q => q.length > 0); // Remove empty queries
            
            // Try iTunes with fuzzy queries
            for (const fuzzyQuery of fuzzyQueries) {
                try {
                    const results = await this.searchiTunes(fuzzyQuery);
                    if (results.length > 0) {
                        return results.slice(0, 3); // Limit fuzzy results
                    }
                } catch (error) {
                    console.error(`Fuzzy search error for "${fuzzyQuery}":`, error.message);
                    continue; // Try next query
                }
            }
            
            // No more fallback - return empty results
            return [];
        } catch (error) {
            console.error('Fuzzy search error:', error);
            return [];
        }
    }
    
    // Search and load lyrics
    async searchAndLoadLyrics(title, artist) {
        try {
            const cacheKey = `${title.toLowerCase()}-${artist.toLowerCase()}`;
            if (this.lyricsCache.has(cacheKey)) {
                const lyrics = this.lyricsCache.get(cacheKey);
                this.loadLyricsFromAPI(lyrics);
                return;
            }
            
            // Try multiple lyrics sources
            let lyrics = await this.searchMusixmatchLyrics(title, artist);
            if (!lyrics) {
                lyrics = await this.searchGeniusLyrics(title, artist);
            }
            
            if (lyrics) {
                this.lyricsCache.set(cacheKey, lyrics);
                this.loadLyricsFromAPI(lyrics);
            }
        } catch (error) {
            console.error('Lyrics search error:', error);
        }
    }
    
    loadLyricsFromAPI(lyrics) {
        if (lyrics.lines) {
            this.lyrics = lyrics.lines.map(line => line.text);
            this.timedLyrics = lyrics.lines.map((line, index) => ({
                text: line.text,
                time: line.time || 0,
                index: index
            }));
        } else {
            this.lyrics = lyrics.split('\n').filter(line => line.trim() !== '');
            this.timedLyrics = [];
        }
        
        this.elements.lyricsInput.value = this.lyrics.join('\n');
        this.updateLyricsDisplay();
        this.updatePracticeAvailability();
    }
    
    // Musixmatch API (requires proxy due to CORS)
    async searchMusixmatchLyrics(title, artist) {
        // This would require a backend proxy due to CORS restrictions
        // For now, return null to use fallback methods
        return null;
    }
    
    // Sample Data Search (removed - no more demo mode)
    
    // Genius API (simplified implementation)
    async searchGeniusLyrics(title, artist) {
        // This would require a backend proxy due to CORS restrictions
        // For now, return null to use fallback methods
        return null;
    }
    
    // Override playAudio to handle YouTube
    playAudio() {
        if (this.isPracticeMode) return;
        
        if (this.isUsingYouTube && this.youtubePlayer && this.youtubePlayer.playVideo) {
            this.youtubePlayer.playVideo();
        } else {
            this.audioPlayer.play();
        }
        this.isPlaying = true;
    }
    
    // Override pauseAudio to handle YouTube
    pauseAudio() {
        if (this.isPracticeMode) return;
        
        if (this.isUsingYouTube && this.youtubePlayer && this.youtubePlayer.pauseVideo) {
            this.youtubePlayer.pauseVideo();
        } else {
            this.audioPlayer.pause();
        }
        this.isPlaying = false;
    }
    
    // Override stopAudio to handle YouTube
    stopAudio() {
        if (this.isPracticeMode) return;
        
        if (this.isUsingYouTube && this.youtubePlayer && this.youtubePlayer.stopVideo) {
            this.youtubePlayer.stopVideo();
        } else {
            this.audioPlayer.pause();
            this.audioPlayer.currentTime = 0;
        }
        this.isPlaying = false;
    }
    
    // YouTube URL handling
    loadYouTubeURL() {
        const url = this.elements.youtubeUrl.value.trim();
        
        if (!url) {
            alert('YouTubeのURLを入力してください');
            return;
        }
        
        if (!this.isValidYouTubeURL(url)) {
            alert('有効なYouTubeのURLを入力してください\n\n対応形式:\n• https://www.youtube.com/watch?v=VIDEO_ID\n• https://youtu.be/VIDEO_ID\n• https://m.youtube.com/watch?v=VIDEO_ID');
            return;
        }
        
        const videoId = this.extractYouTubeVideoId(url);
        if (!videoId) {
            alert('YouTubeの動画IDを取得できませんでした');
            return;
        }
        
        // Get video info and load
        this.loadYouTubeVideoFromURL(videoId, url);
    }
    
    isValidYouTubeURL(url) {
        const patterns = [
            /^(https?:\/\/)?(www\.|m\.)?youtube\.com\/watch\?v=[\w-]+/,
            /^(https?:\/\/)?(www\.)?youtu\.be\/[\w-]+/,
            /^(https?:\/\/)?(www\.|m\.)?youtube\.com\/embed\/[\w-]+/,
            /^(https?:\/\/)?(www\.|m\.)?youtube\.com\/v\/[\w-]+/
        ];
        
        return patterns.some(pattern => pattern.test(url));
    }
    
    extractYouTubeVideoId(url) {
        // Handle different YouTube URL formats
        const patterns = [
            /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/)([^&\n?#]+)/,
            /youtube\.com\/watch\?.*v=([^&\n?#]+)/
        ];
        
        for (const pattern of patterns) {
            const match = url.match(pattern);
            if (match && match[1]) {
                return match[1];
            }
        }
        
        return null;
    }
    
    async loadYouTubeVideoFromURL(videoId, originalUrl) {
        try {
            // Clear previous results
            this.elements.searchResults.innerHTML = '';
            
            // Show loading state
            this.elements.searchResults.innerHTML = '<div class="search-result-item">YouTube動画を読み込み中...</div>';
            
            // Try to get video title using YouTube API (if available)
            let videoTitle = 'YouTube動画';
            let channelTitle = 'YouTube';
            
            if (CONFIG?.YOUTUBE_API_KEY && CONFIG.YOUTUBE_API_KEY !== 'YOUR_YOUTUBE_API_KEY_HERE') {
                try {
                    const response = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${videoId}&key=${CONFIG.YOUTUBE_API_KEY}`);
                    const data = await response.json();
                    
                    if (data.items && data.items.length > 0) {
                        videoTitle = this.cleanTitle(data.items[0].snippet.title);
                        channelTitle = data.items[0].snippet.channelTitle;
                    }
                } catch (error) {
                    console.log('Could not fetch video title, using default');
                }
            }
            
            // Load the video
            this.loadYouTubeVideo(videoId);
            this.currentVideoId = videoId;
            this.isUsingYouTube = true;
            
            // Update song title
            this.elements.songTitle.textContent = `${videoTitle} - ${channelTitle}`;
            
            // Show success message
            this.elements.searchResults.innerHTML = `
                <div class="search-result-item" style="background-color: #d4edda; border-color: #c3e6cb; color: #155724;">
                    <div style="text-align: center; padding: 15px;">
                        <div style="font-size: 20px; margin-bottom: 10px;">✅</div>
                        <div><strong>YouTube動画を読み込みました</strong></div>
                        <div style="font-size: 14px; margin-top: 5px;">
                            ${videoTitle} - ${channelTitle}
                        </div>
                        <div style="font-size: 12px; margin-top: 10px; color: #666;">
                            歌詞を手動で入力するか、下の検索機能で歌詞を検索してください
                        </div>
                    </div>
                </div>
            `;
            
            // Keep URL in input for reference
            
            // Try to search for lyrics automatically
            if (videoTitle !== 'YouTube動画') {
                await this.searchAndLoadLyrics(videoTitle, channelTitle);
            }
            
            this.updatePracticeAvailability();
            
        } catch (error) {
            console.error('Error loading YouTube video:', error);
            this.elements.searchResults.innerHTML = `
                <div class="search-result-item error-message">
                    <div style="text-align: center; padding: 20px;">
                        <div style="font-size: 24px; margin-bottom: 10px;">❌</div>
                        <div><strong>YouTube動画の読み込みに失敗しました</strong></div>
                        <div style="color: #666; font-size: 14px; margin-top: 5px;">
                            URLを確認して再度お試しください
                        </div>
                    </div>
                </div>
            `;
        }
    }
}

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new KaraokeApp();
});