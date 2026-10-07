"""
书法字体子集：按数据与界面实际用到的字，从马善政楷书（Ma Shan Zheng，SIL OFL 1.1）全字库切出两个 woff2。

    python tools/build-fonts.py

- brush-poems.woff2：诗卷用字（public/data 下 poems / trails / tour 里出现的全部汉字与标点）
- brush-ui.woff2：界面用字（src 下源码里出现的汉字 + 地名、作者名、诗题；保留旧子集已有的字）

新增诗词、地点后重跑一次即可（此前诗卷字体是旧数据切出的子集，新加长篇里一千多个字没有，退回系统字体，粗细不一）。
全字库首次运行时下载到 node_modules/.cache/fonts/（不进仓库）。依赖：pip install fonttools brotli
"""
import json
import pathlib
import re
import sys
import urllib.request

from fontTools import subset
from fontTools.ttLib import TTFont

ROOT = pathlib.Path(__file__).resolve().parent.parent
FONTS = ROOT / 'public' / 'fonts'
CACHE = ROOT / 'node_modules' / '.cache' / 'fonts'
SRC_URL = 'https://github.com/google/fonts/raw/main/ofl/mashanzheng/MaShanZheng-Regular.ttf'
SRC = CACHE / 'MaShanZheng-Regular.ttf'

# 汉字、全角标点、中文引号书名号、间隔号
WANT = re.compile(r'[　-〿㐀-䶿一-鿿＀-￯‐-‧·]')
ASCII = ''.join(chr(c) for c in range(0x20, 0x7f))


def source() -> pathlib.Path:
    if not SRC.exists():
        CACHE.mkdir(parents=True, exist_ok=True)
        print('下载全字库', SRC_URL)
        urllib.request.urlretrieve(SRC_URL, SRC)
    return SRC


def chars_of(text: str) -> set[str]:
    return set(WANT.findall(text))


def build(out: pathlib.Path, chars: set[str]) -> None:
    font = TTFont(source())
    cmap = font.getBestCmap()
    have = {c for c in chars if ord(c) in cmap}
    miss = sorted(chars - have)
    opts = subset.Options()
    opts.flavor = 'woff2'
    opts.layout_features = ['*']
    opts.name_IDs = ['*']
    opts.notdef_outline = True
    sub = subset.Subsetter(opts)
    sub.populate(text=''.join(sorted(have)) + ASCII)
    sub.subset(font)
    font.flavor = 'woff2'
    font.save(out)
    print(f'{out.name}: {len(have)} 字，{out.stat().st_size // 1024} KB；全字库也没有的 {len(miss)} 字（退回系统字体）：' + ''.join(miss))


def main() -> int:
    data = ROOT / 'public' / 'data'
    poems_text = ''.join((data / f).read_text(encoding='utf-8') for f in ('poems.json', 'trails.json', 'tour.json') if (data / f).exists())
    build(FONTS / 'brush-poems.woff2', chars_of(poems_text))

    poems = json.loads((data / 'poems.json').read_text(encoding='utf-8'))
    # 界面源码里的文字：去掉注释（注释里的字不上屏，算进去字库会大几倍）
    ui = ''
    for p in (ROOT / 'src').rglob('*'):
        if p.suffix not in ('.ts', '.tsx'):
            continue
        t = p.read_text(encoding='utf-8')
        t = re.sub(r'/\*.*?\*/', '', t, flags=re.S)
        t = re.sub(r'(?<![:\'"])//[^\n]*', '', t)
        ui += t
    names = ''.join([p['name'] + p.get('region', '') for p in poems['places']] + [a['name'] for a in poems['authors']] + [p['title'] for p in poems['poems']])
    old = set()
    old_ui = FONTS / 'brush-ui.woff2'
    if old_ui.exists():
        old = {chr(c) for c in TTFont(old_ui).getBestCmap()}
    build(old_ui, chars_of(ui + names) | {c for c in old if WANT.match(c)})
    return 0


if __name__ == '__main__':
    sys.exit(main())
