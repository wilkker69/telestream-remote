import pytest
from agent import validate_and_parse_command

def test_validate_and_parse_command_valid():
    # Mouse Move
    cmd, err = validate_and_parse_command('{"type": "mousemove", "x": 0.5, "y": 0.5}')
    assert cmd == ("mousemove", 0.5, 0.5)
    assert err is None

    # Clicks and Mouse states
    for action in ["click", "mousedown", "mouseup"]:
        cmd, err = validate_and_parse_command(f'{{"type": "{action}", "button": "right"}}')
        assert cmd == (action, "right")
        assert err is None

    # Scroll
    cmd, err = validate_and_parse_command('{"type": "scroll", "deltaY": 120}')
    assert cmd == ("scroll", 120)
    assert err is None

    # Key actions
    for action in ["keydown", "keyup"]:
        cmd, err = validate_and_parse_command(f'{{"type": "{action}", "key": "enter"}}')
        assert cmd == (action, "enter")
        assert err is None

def test_validate_and_parse_command_invalid_payloads():
    # Invalid JSON
    cmd, err = validate_and_parse_command('invalid-json')
    assert cmd is None
    assert err == "Erro de JSON inválido"

    # Non-dictionary JSON
    cmd, err = validate_and_parse_command('[1, 2, 3]')
    assert cmd is None
    assert err == "Mensagem inválida (esperado objeto JSON)"

    # Missing type
    cmd, err = validate_and_parse_command('{"x": 10}')
    assert cmd is None
    assert err == "Tipo ausente"

    # Unknown type
    cmd, err = validate_and_parse_command('{"type": "unknown"}')
    assert cmd is None
    assert err == "Tipo desconhecido"

def test_validate_and_parse_command_invalid_parameters():
    # Missing coordinates
    cmd, err = validate_and_parse_command('{"type": "mousemove"}')
    assert cmd is None
    assert err == "Coordenadas ausentes"

    # Non-numeric coordinates
    cmd, err = validate_and_parse_command('{"type": "mousemove", "x": "abc", "y": 0.5}')
    assert cmd is None
    assert err == "Coordenadas inválidas"

    # Invalid button
    cmd, err = validate_and_parse_command('{"type": "click", "button": "invalid"}')
    assert cmd is None
    assert err == "Botão inválido"

    # Non-numeric scroll delta
    cmd, err = validate_and_parse_command('{"type": "scroll", "deltaY": "abc"}')
    assert cmd is None
    assert err == "deltaY inválido"

    # Missing key
    cmd, err = validate_and_parse_command('{"type": "keydown"}')
    assert cmd is None
    assert err == "Tecla ausente"

def test_handle_client_failsafe():
    import asyncio
    from unittest.mock import AsyncMock, patch
    import pyautogui
    import agent

    async def run_test():
        # Mock stop_future
        agent.stop_future = asyncio.get_running_loop().create_future()
        
        # Mock websocket that yields one valid mousemove message
        mock_websocket = AsyncMock()
        
        async def mock_iter(*args, **kwargs):
            yield '{"type": "mousemove", "x": 0.5, "y": 0.5}'
            
        mock_websocket.__aiter__ = mock_iter
        
        with patch("pyautogui.moveTo", side_effect=pyautogui.FailSafeException("Failsafe")):
            with pytest.raises(pyautogui.FailSafeException):
                await agent.handle_client(mock_websocket)
                
            assert agent.stop_future.done()
            with pytest.raises(pyautogui.FailSafeException):
                await agent.stop_future
                
    asyncio.run(run_test())

def test_headless_resolution_fallback():
    import importlib
    from unittest.mock import patch
    import agent

    with patch("pyautogui.size", side_effect=Exception("Headless error")):
        importlib.reload(agent)
        assert agent.SCREEN_WIDTH == 1920
        assert agent.SCREEN_HEIGHT == 1080

    # Restore the actual screen size after test
    importlib.reload(agent)

def test_validate_and_parse_command_type_error():
    # Coordenadas com tipo inválido (list ou dict)
    cmd, err = validate_and_parse_command('{"type": "mousemove", "x": [1, 2], "y": 0.5}')
    assert cmd is None
    assert err == "Coordenadas inválidas"

    cmd, err = validate_and_parse_command('{"type": "mousemove", "x": 0.5, "y": {"nested": 1}}')
    assert cmd is None
    assert err == "Coordenadas inválidas"

    # Scroll com tipo inválido (list ou dict)
    cmd, err = validate_and_parse_command('{"type": "scroll", "deltaY": [120]}')
    assert cmd is None
    assert err == "deltaY inválido"

    cmd, err = validate_and_parse_command('{"type": "scroll", "deltaY": {"nested": 1}}')
    assert cmd is None
    assert err == "deltaY inválido"

def test_handle_client_coordinate_clamping():
    import asyncio
    from unittest.mock import AsyncMock, patch
    import agent

    # Usando resolucao conhecida para facilitar as contas
    agent.SCREEN_WIDTH = 1000
    agent.SCREEN_HEIGHT = 1000

    async def run_test():
        # Testar cantos extremos (0,0) -> deve ir para (1, 1)
        # Testar cantos extremos (1,1) -> deve ir para (SCREEN_WIDTH - 2, SCREEN_HEIGHT - 2)
        # Testar valores fora dos limites (ex: negativos ou maiores que 1.0)
        messages = [
            '{"type": "mousemove", "x": 0.0, "y": 0.0}',
            '{"type": "mousemove", "x": 1.0, "y": 1.0}',
            '{"type": "mousemove", "x": -0.5, "y": 1.5}'
        ]
        
        mock_websocket = AsyncMock()
        
        async def mock_iter(*args, **kwargs):
            for m in messages:
                yield m
            
        mock_websocket.__aiter__ = mock_iter
        
        with patch("pyautogui.moveTo") as mock_move_to:
            await agent.handle_client(mock_websocket)
            
            # moveTo deve ter sido chamado com valores clamped:
            # 1. (0.0 * 1000, 0.0 * 1000) -> (0, 0) clamped -> (1, 1)
            # 2. (1.0 * 1000, 1.0 * 1000) -> (1000, 1000) clamped -> (998, 998)
            # 3. (-0.5 * 1000, 1.5 * 1000) -> (-500, 1500) clamped -> (1, 998)
            assert mock_move_to.call_count == 3
            mock_move_to.assert_any_call(1, 1)
            mock_move_to.assert_any_call(998, 998)
            mock_move_to.assert_any_call(1, 998)

    asyncio.run(run_test())
    
    # Recarrega o agent para restaurar a resolução real
    import importlib
    importlib.reload(agent)
