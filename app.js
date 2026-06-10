document.addEventListener('DOMContentLoaded', () => {
    // Elementos de Navegação
    const modeSelector = document.getElementById('mode-selector');
    const panelStreamer = document.getElementById('panel-streamer');
    const panelViewer = document.getElementById('panel-viewer');
    
    const btnSelectStreamer = document.getElementById('btn-select-streamer');
    const btnSelectViewer = document.getElementById('btn-select-viewer');
    const btnBackList = document.querySelectorAll('.btn-back');

    // Elementos do Streamer
    const btnStartStream = document.getElementById('btn-start-stream');
    const btnStopStream = document.getElementById('btn-stop-stream');
    const agentStatus = document.getElementById('agent-status');
    const streamerIdDisplay = document.getElementById('streamer-id-display');
    const localVideoPreview = document.getElementById('local-video-preview');

    // Elementos do Viewer
    const inputTargetId = document.getElementById('input-target-id');
    const btnConnectStream = document.getElementById('btn-connect-stream');
    const btnDisconnectStream = document.getElementById('btn-disconnect-stream');
    const viewerControlBar = document.getElementById('viewer-control-bar');
    const connectionStatus = document.getElementById('connection-status');
    const toggleControlEnabled = document.getElementById('toggle-control-enabled');
    const videoContainer = document.getElementById('video-container');
    const videoPlaceholder = document.getElementById('video-placeholder');
    const remoteVideo = document.getElementById('remote-video');

    // Variaveis de Estado
    let peer = null;
    let localStream = null;
    let activeConnections = [];
    let localAgentSocket = null;
    let currentCall = null;
    let currentDataConnection = null;
    let reconnectTimeout = null;

    // Navegação do Hub
    btnSelectStreamer.addEventListener('click', () => {
        modeSelector.classList.add('hidden');
        panelStreamer.classList.remove('hidden');
        initStreamerMode();
    });

    btnSelectViewer.addEventListener('click', () => {
        modeSelector.classList.add('hidden');
        panelViewer.classList.remove('hidden');
        initViewerMode();
    });

    btnBackList.forEach(btn => {
        btn.addEventListener('click', () => {
            cleanupAll();
            panelStreamer.classList.add('hidden');
            panelViewer.classList.add('hidden');
            modeSelector.classList.remove('hidden');
        });
    });

    // --- Lógica do Agente Python Local (WebSocket) ---
    function connectLocalAgent() {
        if (localAgentSocket && localAgentSocket.readyState === WebSocket.OPEN) return;

        agentStatus.textContent = 'Conectando...';
        agentStatus.className = 'badge badge-gray';

        // Conecta no websocket local aberto pelo python agent.py
        localAgentSocket = new WebSocket('ws://localhost:9000');

        localAgentSocket.onopen = () => {
            agentStatus.textContent = 'Conectado';
            agentStatus.className = 'badge badge-green';
            console.log('[STREAMER] Conectado ao agente Python local na porta 9000');
        };

        localAgentSocket.onclose = () => {
            agentStatus.textContent = 'Desconectado';
            agentStatus.className = 'badge badge-red';
            localAgentSocket = null;
            // Tenta reconectar a cada 5 segundos se não estiver sendo limpo
            reconnectTimeout = setTimeout(connectLocalAgent, 5000);
        };

        localAgentSocket.onerror = (err) => {
            console.warn('[STREAMER] WebSocket do agente Python local falhou.');
        };
    }

    // --- Lógica do Streamer (Transmissor) ---
    function initStreamerMode() {
        connectLocalAgent();
        // Configura o PeerJS
        if (!peer) {
            const uniqueId = 'telestream-' + Math.random().toString(36).substring(2, 8);
            peer = new Peer(uniqueId);

            peer.on('open', (id) => {
                streamerIdDisplay.textContent = id;
                streamerIdDisplay.className = 'badge badge-green';
                console.log('[STREAMER] ID PeerJS gerado:', id);
            });

            peer.on('connection', (conn) => {
                console.log('[STREAMER] Conexão de dados recebida do Viewer');
                activeConnections.push(conn);
                
                conn.on('data', (data) => {
                    // Se o websocket local estiver aberto, encaminha os comandos de input
                    if (localAgentSocket && localAgentSocket.readyState === WebSocket.OPEN) {
                        localAgentSocket.send(JSON.stringify(data));
                    } else {
                        console.warn('[STREAMER] Recebeu comando, mas o agente Python não está conectado.');
                    }
                });

                conn.on('close', () => {
                    console.log('[STREAMER] Conexão de dados do Viewer fechada');
                    activeConnections = activeConnections.filter(c => c !== conn);
                });
            });

            peer.on('call', (call) => {
                console.log('[STREAMER] Recebendo chamada de vídeo do Viewer. Respondendo...');
                if (localStream) {
                    call.answer(localStream);
                    currentCall = call;
                } else {
                    console.warn('[STREAMER] Nenhuma stream de vídeo local activa para responder a chamada.');
                }
            });

            peer.on('error', (err) => {
                console.error('[STREAMER] Erro PeerJS:', err);
                streamerIdDisplay.textContent = 'Erro de Rede';
                streamerIdDisplay.className = 'badge badge-red';
            });
        }
    }

    btnStartStream.addEventListener('click', async () => {
        try {
            // Requisitar tela ao navegador
            localStream = await navigator.mediaDevices.getDisplayMedia({
                video: {
                    cursor: "always",
                    frameRate: { ideal: 30, max: 60 }
                },
                audio: false
            });

            localVideoPreview.srcObject = localStream;
            localVideoPreview.classList.remove('hidden');
            
            btnStartStream.classList.add('hidden');
            btnStopStream.classList.remove('hidden');

            // Se a stream for interrompida pelo botão flutuante nativo do navegador
            const videoTrack = localStream.getVideoTracks()[0];
            if (videoTrack) {
                videoTrack.onended = () => {
                    stopStream();
                };
            }

            console.log('[STREAMER] Captura de tela iniciada com sucesso.');
        } catch (err) {
            console.error('[STREAMER] Falha ao capturar tela:', err);
            alert('Não foi possível iniciar a captura de tela. Certifique-se de dar as permissões necessárias.');
        }
    });

    btnStopStream.addEventListener('click', () => {
        stopStream();
    });

    function stopStream() {
        if (localStream) {
            localStream.getTracks().forEach(track => track.stop());
            localStream = null;
        }
        localVideoPreview.srcObject = null;
        localVideoPreview.classList.add('hidden');
        
        btnStartStream.classList.remove('hidden');
        btnStopStream.classList.add('hidden');
        console.log('[STREAMER] Transmissão parada.');
    }

    // Placeholder para os métodos do visualizador que serão adicionados na Task 5
    function initViewerMode() {
        console.log('[VIEWER] Inicialização temporária.');
    }

    function cleanupAll() {
        stopStream();
        
        if (reconnectTimeout) {
            clearTimeout(reconnectTimeout);
            reconnectTimeout = null;
        }
        if (localAgentSocket) {
            localAgentSocket.onclose = null; // Evita loop de reconexão
            localAgentSocket.close();
            localAgentSocket = null;
        }
        activeConnections.forEach(conn => conn.close());
        activeConnections = [];
        
        if (peer) {
            peer.destroy();
            peer = null;
        }
    }
});
