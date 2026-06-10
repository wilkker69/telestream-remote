import asyncio
import websockets
import websockets.exceptions
import json
import pyautogui
import sys
import ctypes

# PERFORMANCE: Zerar pausa entre comandos - a pausa padrão (0.05s) é o maior causador de lag
pyautogui.FAILSAFE = True
pyautogui.PAUSE = 0.0  # SEM pausa entre comandos - velocidade máxima

# PERFORMANCE: Detecção de sistema operacional para chamadas nativas de alta performance
IS_WINDOWS = sys.platform == "win32"

if IS_WINDOWS:
    # Estruturas necessárias para ler a posição do mouse e checar failsafe
    class POINT(ctypes.Structure):
        _fields_ = [("x", ctypes.c_long), ("y", ctypes.c_long)]

    # MOUSEEVENTF flags para o Windows
    MOUSEEVENTF_LEFTDOWN = 0x0002
    MOUSEEVENTF_LEFTUP = 0x0004
    MOUSEEVENTF_RIGHTDOWN = 0x0008
    MOUSEEVENTF_RIGHTUP = 0x0010
    MOUSEEVENTF_MIDDLEDOWN = 0x0020
    MOUSEEVENTF_MIDDLEUP = 0x0040
    MOUSEEVENTF_WHEEL = 0x0800

    # Mapeamento de teclas especiais que o pyautogui recebe para Virtual Key Codes do Windows (VK)
    VK_MAP = {
        "backspace": 0x08, "back": 0x08,
        "tab": 0x09,
        "enter": 0x0D, "return": 0x0D,
        "shift": 0x10, "shiftleft": 0xA0, "shiftright": 0xA1,
        "ctrl": 0x11, "ctrlleft": 0xA2, "ctrlright": 0xA3, "control": 0x11,
        "alt": 0x12, "altleft": 0xA4, "altright": 0xA5,
        "pause": 0x13,
        "capslock": 0x14,
        "esc": 0x1B, "escape": 0x1B,
        "space": 0x20,
        "pageup": 0x21, "pgup": 0x21,
        "pagedown": 0x22, "pgdn": 0x22,
        "end": 0x23,
        "home": 0x24,
        "left": 0x25, "arrowleft": 0x25,
        "up": 0x26, "arrowup": 0x26,
        "right": 0x27, "arrowright": 0x27,
        "down": 0x28, "arrowdown": 0x28,
        "select": 0x29,
        "print": 0x2A,
        "execute": 0x2B,
        "prtscr": 0x2C, "printscreen": 0x2C,
        "insert": 0x2D,
        "delete": 0x2E, "del": 0x2E,
        "help": 0x2F,
        "lwin": 0x5B, "win": 0x5B, "winleft": 0x5B,
        "rwin": 0x5C, "winright": 0x5C,
        "numpad0": 0x60, "numpad1": 0x61, "numpad2": 0x62, "numpad3": 0x63,
        "numpad4": 0x64, "numpad5": 0x65, "numpad6": 0x66, "numpad7": 0x67,
        "numpad8": 0x68, "numpad9": 0x69,
        "multiply": 0x6A,
        "add": 0x6B,
        "separator": 0x6C,
        "subtract": 0x6D,
        "decimal": 0x6E,
        "divide": 0x6F,
        "f1": 0x70, "f2": 0x71, "f3": 0x72, "f4": 0x73, "f5": 0x74, "f6": 0x75,
        "f7": 0x76, "f8": 0x77, "f9": 0x78, "f10": 0x79, "f11": 0x7A, "f12": 0x7B,
        "numlock": 0x90,
        "scrolllock": 0x91,
    }

    def check_failsafe():
        if pyautogui.FAILSAFE:
            pt = POINT()
            ctypes.windll.user32.GetCursorPos(ctypes.byref(pt))
            if pt.x == 0 and pt.y == 0:
                raise pyautogui.FailSafeException("PyAutoGUI fail-safe triggered by mouse position at (0, 0)")

    def win_move_to(x, y, *args, **kwargs):
        check_failsafe()
        ctypes.windll.user32.SetCursorPos(x, y)

    def win_mouse_event(flags, data=0):
        check_failsafe()
        ctypes.windll.user32.mouse_event(flags, 0, 0, data, 0)

    def win_click(button="left", *args, **kwargs):
        win_mousedown(button)
        win_mouseup(button)

    def win_mousedown(button="left", *args, **kwargs):
        if button == "left":
            win_mouse_event(MOUSEEVENTF_LEFTDOWN)
        elif button == "right":
            win_mouse_event(MOUSEEVENTF_RIGHTDOWN)
        elif button == "middle":
            win_mouse_event(MOUSEEVENTF_MIDDLEDOWN)

    def win_mouseup(button="left", *args, **kwargs):
        if button == "left":
            win_mouse_event(MOUSEEVENTF_LEFTUP)
        elif button == "right":
            win_mouse_event(MOUSEEVENTF_RIGHTUP)
        elif button == "middle":
            win_mouse_event(MOUSEEVENTF_MIDDLEUP)

    def win_scroll(clicks, *args, **kwargs):
        # WHEEL_DELTA no Windows é 120
        win_mouse_event(MOUSEEVENTF_WHEEL, clicks * 120)

    def win_key_event(key, down=True):
        check_failsafe()
        vk = None
        if len(key) == 1:
            res = ctypes.windll.user32.VkKeyScanW(ord(key))
            if res != -1:
                vk = res & 0xFF
        else:
            vk = VK_MAP.get(key.lower())
            
        if vk is not None:
            flags = 0 if down else 0x0002 # KEYEVENTF_KEYUP = 0x0002
            ctypes.windll.user32.keybd_event(vk, 0, flags, 0)
        else:
            # Fallback para pyautogui original
            if down:
                _orig_keydown(key, _pause=False)
            else:
                _orig_keyup(key, _pause=False)

    def win_keydown(key, *args, **kwargs):
        win_key_event(key, down=True)

    def win_keyup(key, *args, **kwargs):
        win_key_event(key, down=False)

    # Manter referências das funções originais do pyautogui caso precisemos
    _orig_keydown = pyautogui.keyDown
    _orig_keyup = pyautogui.keyUp

    # Monkeypatching pyautogui para usar as funções nativas ultrarápidas do Windows
    pyautogui.moveTo = win_move_to
    pyautogui.click = win_click
    pyautogui.mouseDown = win_mousedown
    pyautogui.mouseUp = win_mouseup
    pyautogui.scroll = win_scroll
    pyautogui.keyDown = win_keydown
    pyautogui.keyUp = win_keyup
    
    print("[AGENTE] BACKEND ATIVO: Windows API (user32.dll) via ctypes para performance máxima.")
else:
    print("[AGENTE] BACKEND ATIVO: PyAutoGUI padrão (não-Windows).")

# Referência ao future para parar o servidor em caso de failsafe
stop_future = None

# Obter dimensões da tela local com fallback headless
try:
    SCREEN_WIDTH, SCREEN_HEIGHT = pyautogui.size()
    print(f"[AGENTE] Resolução da tela detectada: {SCREEN_WIDTH}x{SCREEN_HEIGHT}")
except Exception as e:
    print(f"[AGENTE] [Aviso] Não foi possível detectar resolução da tela: {e}. Usando fallback 1920x1080.")
    SCREEN_WIDTH, SCREEN_HEIGHT = 1920, 1080

def validate_and_parse_command(message_str):
    try:
        msg = json.loads(message_str)
    except ValueError:
        return None, "Erro de JSON inválido"
    
    if not isinstance(msg, dict):
        return None, "Mensagem inválida (esperado objeto JSON)"
    
    msg_type = msg.get("type")
    if not msg_type:
        return None, "Tipo ausente"
    
    if msg_type == "mousemove":
        x = msg.get("x")
        y = msg.get("y")
        if x is None or y is None:
            return None, "Coordenadas ausentes"
        try:
            return ("mousemove", float(x), float(y)), None
        except (ValueError, TypeError):
            return None, "Coordenadas inválidas"
            
    elif msg_type in ["mousedown", "mouseup", "click"]:
        btn = msg.get("button", "left")
        if btn not in ["left", "right", "middle"]:
            return None, "Botão inválido"
        return (msg_type, btn), None
        
    elif msg_type == "scroll":
        delta = msg.get("deltaY", 0)
        try:
            return ("scroll", int(delta)), None
        except (ValueError, TypeError):
            return None, "deltaY inválido"
            
    elif msg_type in ["keydown", "keyup"]:
        key = msg.get("key")
        if not key:
            return None, "Tecla ausente"
        return (msg_type, str(key)), None
    
    return None, "Tipo desconhecido"

async def handle_client(websocket):
    global stop_future
    print("[AGENTE] Transmissor conectado ao agente local.")
    # PERFORMANCE: Processar múltiplos comandos em batch para reduzir overhead
    # Acumular último mousemove para descartar intermediários (só executa o mais recente)
    pending_mousemove = None
    
    try:
        async for message in websocket:
            cmd, err = validate_and_parse_command(message)
            if err:
                print(f"[AGENTE] Comando inválido recebido: {err} ({message})")
                continue
            
            action = cmd[0]
            try:
                if action == "mousemove":
                    _, rx, ry = cmd
                    # Garante que as coordenadas remotas fiquem entre 1 e SCREEN - 2
                    abs_x = max(1, min(SCREEN_WIDTH - 2, int(rx * SCREEN_WIDTH)))
                    abs_y = max(1, min(SCREEN_HEIGHT - 2, int(ry * SCREEN_HEIGHT)))
                    # PERFORMANCE: duration=0 = movimento instantâneo sem animação
                    pyautogui.moveTo(abs_x, abs_y, duration=0)
                
                elif action == "click":
                    _, button = cmd
                    pyautogui.click(button=button, _pause=False)
                
                elif action == "mousedown":
                    _, button = cmd
                    pyautogui.mouseDown(button=button, _pause=False)
                
                elif action == "mouseup":
                    _, button = cmd
                    pyautogui.mouseUp(button=button, _pause=False)
                
                elif action == "scroll":
                    _, delta_y = cmd
                    # Converter deltaY do navegador (pixels) para clicks de scroll
                    # deltaY do browser varia de ~100 a ~300 por step, pyautogui usa clicks (1 = um dente da roda)
                    scroll_clicks = -int(delta_y / 100)
                    if scroll_clicks != 0:
                        pyautogui.scroll(scroll_clicks, _pause=False)
                
                elif action == "keydown":
                    _, key = cmd
                    pyautogui.keyDown(key, _pause=False)
                
                elif action == "keyup":
                    _, key = cmd
                    pyautogui.keyUp(key, _pause=False)
                    
            except pyautogui.FailSafeException as failsafe_err:
                print("[AGENTE] Failsafe do PyAutoGUI acionado! Encerrando...")
                raise failsafe_err
            except Exception as exec_err:
                print(f"[AGENTE] Erro ao executar comando {cmd}: {exec_err}")
                
    except websockets.exceptions.ConnectionClosed:
        print("[AGENTE] Transmissor desconectou do agente local.")
    except pyautogui.FailSafeException as failsafe_err:
        if stop_future and not stop_future.done():
            stop_future.set_exception(failsafe_err)
        raise
    except Exception as e:
        print(f"[AGENTE] Erro durante a conexão: {e}")

async def main():
    global stop_future
    stop_future = asyncio.get_running_loop().create_future()
    print("[AGENTE] Iniciando servidor WebSocket local na porta 9000...")
    print("[AGENTE] MODO ALTA PERFORMANCE: PAUSE=0, duration=0")
    # PERFORMANCE: max_size aumentado para aceitar mensagens maiores sem erro
    # PERFORMANCE: compression=None desabilita compressão (comandos JSON são pequenos, não precisam)
    async with websockets.serve(
        handle_client,
        "127.0.0.1",
        9000,
        max_size=65536,
        compression=None,
        ping_interval=None,
        ping_timeout=None
    ):
        await stop_future

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n[AGENTE] Encerrado pelo usuário.")
    except pyautogui.FailSafeException:
        print("[AGENTE] Servidor encerrado via Failsafe do PyAutoGUI.")
