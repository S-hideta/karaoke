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
        
        this.initializeElements();
        this.setupEventListeners();
        this.requestMicrophonePermission();
        this.loadSavedSessions();
        this.initializeYouTubePlayer();
        this.checkAPIConfiguration();
    }
    
    initializeElements() {
        this.elements = {
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
        // Search functionality
        this.elements.searchBtn.addEventListener('click', () => this.searchSongs());
        this.elements.songSearch.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.searchSongs();
        });
        
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
        
        this.audioPlayer.pause();
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
        this.audioPlayer.play();
        this.practiceTimer = setTimeout(() => {
            this.handlePracticeLineComplete();
        }, 5000);
    }
    
    handlePracticeLineComplete() {
        if (this.practiceTimer) {
            clearTimeout(this.practiceTimer);
            this.practiceTimer = null;
        }
        
        this.audioPlayer.pause();
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
            
            // Combine results from multiple APIs
            const results = await Promise.all([
                this.searchYouTube(query),
                this.searchiTunes(query),
                this.searchSampleData(query)
            ]);
            
            const combinedResults = this.combineSearchResults(results.flat());
            
            if (combinedResults.length > 0) {
                this.searchCache.set(cacheKey, combinedResults);
                this.displaySearchResults(combinedResults);
            } else {
                // Fuzzy search as fallback
                const fuzzyResults = await this.fuzzySearch(query);
                if (fuzzyResults.length > 0) {
                    this.displaySearchResults(fuzzyResults, true);
                } else {
                    this.elements.searchResults.innerHTML = '<div class="search-result-item">検索結果が見つかりませんでした</div>';
                }
            }
        } catch (error) {
            console.error('Search error:', error);
            this.elements.searchResults.innerHTML = '<div class="search-result-item">検索中にエラーが発生しました</div>';
        }
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
        
        // Load lyrics from sample data or search APIs
        if (song.lyrics && song.source === 'Sample') {
            this.loadLyricsFromSample(song.lyrics);
        } else {
            await this.searchAndLoadLyrics(song.title, song.artist);
        }
        
        this.updatePracticeAvailability();
    }
    
    loadLyricsFromSample(sampleLyrics) {
        this.lyrics = sampleLyrics;
        this.timedLyrics = []; // No timing data for sample lyrics
        this.elements.lyricsInput.value = this.lyrics.join('\n');
        this.updateLyricsDisplay();
        this.updatePracticeAvailability();
    }
    
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
        if (!this.audioPlayer.src) {
            alert('楽曲を選択してください');
            return;
        }
        
        const timedLyric = this.timedLyrics.find(tl => tl.index === index);
        if (timedLyric) {
            // Start playback 1 second before the vocal
            const startTime = Math.max(0, timedLyric.time - 1);
            this.audioPlayer.currentTime = startTime;
            
            // Highlight the selected line
            this.highlightLine(index);
            
            // Play for approximately 8 seconds (or until next line)
            this.audioPlayer.play();
            
            if (this.phrasePlaybackTimer) {
                clearTimeout(this.phrasePlaybackTimer);
            }
            
            const nextTimed = this.timedLyrics.find(tl => tl.index === index + 1);
            const playDuration = nextTimed ? 
                (nextTimed.time - timedLyric.time + 1) * 1000 : 
                8000; // 8 seconds default
            
            this.phrasePlaybackTimer = setTimeout(() => {
                this.audioPlayer.pause();
                this.clearLyricsHighlight();
            }, playDuration);
        } else {
            // If no timing info, just play from current position
            this.audioPlayer.play();
            this.highlightLine(index);
            
            // Stop after 8 seconds
            if (this.phrasePlaybackTimer) {
                clearTimeout(this.phrasePlaybackTimer);
            }
            
            this.phrasePlaybackTimer = setTimeout(() => {
                this.audioPlayer.pause();
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
    
    // API Configuration Check
    checkAPIConfiguration() {
        const apiStatus = document.getElementById('api-status');
        if (!apiStatus) return;
        
        const hasYouTubeAPI = CONFIG.YOUTUBE_API_KEY && CONFIG.YOUTUBE_API_KEY !== 'YOUR_YOUTUBE_API_KEY_HERE';
        const hasMusixmatchAPI = CONFIG.MUSIXMATCH_API_KEY && CONFIG.MUSIXMATCH_API_KEY !== 'YOUR_MUSIXMATCH_API_KEY_HERE';
        
        if (!hasYouTubeAPI && !hasMusixmatchAPI) {
            apiStatus.className = 'api-status warning';
            apiStatus.innerHTML = `
                <strong>🔧 API設定について</strong><br>
                現在はデモモードで動作しています。より多くの楽曲と歌詞を検索するには、以下のAPIキーを設定してください：<br>
                • YouTube Data API v3 (楽曲検索)<br>
                • Musixmatch API (歌詞検索)<br>
                詳細は config.js ファイルをご確認ください。
            `;
            apiStatus.style.display = 'block';
        } else {
            let message = '<strong>✅ API設定状況</strong><br>';
            message += hasYouTubeAPI ? '• YouTube API: 有効<br>' : '• YouTube API: 無効<br>';
            message += hasMusixmatchAPI ? '• Musixmatch API: 有効<br>' : '• Musixmatch API: 無効<br>';
            
            apiStatus.className = 'api-status success';
            apiStatus.innerHTML = message;
            apiStatus.style.display = 'block';
        }
        
        if (typeof checkAPIKeys === 'function') {
            checkAPIKeys();
        }
    }
    
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
        if (!CONFIG.YOUTUBE_API_KEY || CONFIG.YOUTUBE_API_KEY === 'YOUR_YOUTUBE_API_KEY_HERE') {
            return [];
        }
        
        try {
            const url = `${CONFIG.YOUTUBE_SEARCH_URL}?part=snippet&q=${encodeURIComponent(query + ' karaoke')}&type=video&maxResults=${CONFIG.YOUTUBE_SEARCH_RESULTS}&key=${CONFIG.YOUTUBE_API_KEY}`;
            const response = await fetch(url);
            const data = await response.json();
            
            if (data.items) {
                return data.items.map(item => ({
                    title: item.snippet.title.replace(/\s*\(.*?\)|\s*\[.*?\]/g, ''),
                    artist: item.snippet.channelTitle,
                    duration: 'YouTube',
                    videoId: item.id.videoId,
                    thumbnail: item.snippet.thumbnails.default.url,
                    source: 'YouTube'
                }));
            }
            return [];
        } catch (error) {
            console.error('YouTube search error:', error);
            return [];
        }
    }
    
    // iTunes API Search
    async searchiTunes(query) {
        try {
            const url = `${CONFIG.ITUNES_SEARCH_URL}?term=${encodeURIComponent(query)}&media=music&limit=${CONFIG.ITUNES_SEARCH_RESULTS}`;
            const response = await fetch(url);
            const data = await response.json();
            
            if (data.results) {
                return data.results.map(item => ({
                    title: item.trackName,
                    artist: item.artistName,
                    duration: this.formatTime(item.trackTimeMillis / 1000),
                    previewUrl: item.previewUrl,
                    artwork: item.artworkUrl100,
                    source: 'iTunes'
                }));
            }
            return [];
        } catch (error) {
            console.error('iTunes search error:', error);
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
        const fuzzyQueries = [
            query.replace(/\s+/g, ''),
            query.split(' ').reverse().join(' '),
            query + ' cover',
            query + ' instrumental',
            query.replace(/[^\w\s]/gi, '')
        ];
        
        for (const fuzzyQuery of fuzzyQueries) {
            const results = await this.searchiTunes(fuzzyQuery);
            if (results.length > 0) {
                return results;
            }
        }
        
        // Final fallback: search sample data with fuzzy matching
        return this.searchSampleData(query, true);
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
    
    // Sample Data Search
    async searchSampleData(query, fuzzyMode = false) {
        if (!CONFIG.DEMO_SONGS) return [];
        
        const results = CONFIG.DEMO_SONGS.filter(song => {
            const titleMatch = song.title.toLowerCase().includes(query.toLowerCase());
            const artistMatch = song.artist.toLowerCase().includes(query.toLowerCase());
            
            if (fuzzyMode) {
                // More lenient matching for fuzzy search
                const queryWords = query.toLowerCase().split(/\s+/);
                const titleWords = song.title.toLowerCase().split(/\s+/);
                const artistWords = song.artist.toLowerCase().split(/\s+/);
                
                return queryWords.some(qword => 
                    titleWords.some(tword => tword.includes(qword)) ||
                    artistWords.some(aword => aword.includes(qword))
                );
            }
            
            return titleMatch || artistMatch;
        });
        
        return results.map(song => ({
            ...song,
            thumbnail: null,
            previewUrl: null
        }));
    }
    
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
}

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new KaraokeApp();
});