"""テスト共通の設定。

`pythonpath = ["src"]` を pyproject.toml に置いているが、pytest を使わずに
テストファイルを直接実行したい場合に備えて import パスも通しておく。
"""

import sys
from pathlib import Path

SRC = Path(__file__).resolve().parent.parent / "src"
if str(SRC) not in sys.path:
    sys.path.insert(0, str(SRC))
