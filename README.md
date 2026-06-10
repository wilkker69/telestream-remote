# TeleStream Remote 📺🎮

Um sistema leve e de alta performance de transmissão e controle remoto de tela, projetado para rodar diretamente do navegador (hospedado no GitHub Pages) auxiliado por um script Python leve rodando localmente na máquina compartilhada.

## Como funciona?
1. A captura e codificação de vídeo de tela são tratadas nativamente pelo navegador via **WebRTC (P2P)** usando a infraestrutura pública gratuita do **PeerJS**.
2. Os cliques, movimentos de mouse e toques de teclado são enviados do visualizador (Viewer) para o transmissor (Streamer) diretamente.
3. O navegador do transmissor repassa as ações recebidas para o script local `agent.py` via **WebSocket (`localhost:9000`)**.
4. O script Python simula os comandos em nível de sistema usando a biblioteca `pyautogui`.

## Requisitos
Na máquina que irá **transmitir** a tela e ser controlada, você precisará ter o Python 3 instalado e as seguintes bibliotecas:

```bash
pip install pyautogui websockets pytest
```

## Como Utilizar

### 1. Preparando o Transmissor (Quem compartilha a tela)
1. Clone o repositório ou baixe os arquivos em sua máquina.
2. Inicie o agente auxiliar de controle remoto no terminal:
   ```bash
   python agent.py
   ```
3. Abra a interface web (hospedada no GitHub Pages, ou abra o arquivo `index.html` localmente).
4. Clique em **"Transmitir Minha Tela"**.
5. Você verá o indicador do "Agente Local Python" ficar verde (**Conectado**).
6. Clique em **"Começar Transmissão"** e escolha a tela cheia ou janela que deseja compartilhar.
7. Copie o ID gerado (ex: `telestream-xxxxxx`) e envie-o para a pessoa que irá te controlar.

### 2. Conectando como Visualizador (Quem assiste/controla)
1. Abra a mesma página da web hospedada no GitHub Pages.
2. Clique em **"Controlar uma Tela"**.
3. Cole o ID do transmissor no campo de entrada e clique em **"Conectar"**.
4. O vídeo da tela remota será exibido.
5. Marque a caixa de seleção **"Habilitar Controle Remoto"** e mova o mouse ou clique sobre o vídeo para interagir com a máquina remota!

## Failsafe de Segurança (Parada de Emergência)
Como o script Python simula o mouse e o teclado, se por qualquer motivo você perder o controle das coordenadas, o **PyAutoGUI** possui uma trava de segurança ativada por padrão:
*   **Mova agressivamente o cursor do mouse físico da sua máquina para qualquer um dos quatro cantos extremos da sua tela principal**. Isso lançará uma exceção no script Python e abortará a simulação de comandos imediatamente.
