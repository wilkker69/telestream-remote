import pytest
from agent import validate_and_parse_command

def test_validate_and_parse_command():
    # Teste movimento de mouse válido
    cmd, err = validate_and_parse_command('{"type": "mousemove", "x": 0.5, "y": 0.5}')
    assert cmd == ("mousemove", 0.5, 0.5)
    assert err is None

    # Teste clique válido
    cmd, err = validate_and_parse_command('{"type": "click", "button": "right"}')
    assert cmd == ("click", "right")
    assert err is None

    # Teste comando inválido
    cmd, err = validate_and_parse_command('{"type": "invalid"}')
    assert cmd is None
    assert err == "Tipo desconhecido"
