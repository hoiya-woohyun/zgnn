# 본문 글꼴(Zgnn Sans)을 두 조각으로 쪼갠다 — 화면이 거의 모든 글자를 쓰는 Core 와, 받을 일이 드문 Ext.
# 실행: python3 scripts/split-fonts.py   (fonttools·brotli 필요: pip install fonttools brotli)
#   입력  src/app/fonts/ZgnnSans-Variable.woff2           — 완성형 11,172자 정본, 굵기 축 400–700(재생성은 docs/architecture/pwa-offline.md)
#         src/data/*.json                                  — 화면에 나오는 데이터(KS X 1001 밖 음절이 있으면 Core 로 올린다)
#   출력  src/app/fonts/ZgnnSans-Variable-{Core,Ext}.woff2
#         src/styles/appSansExt.css                        — Ext 의 @font-face(unicode-range)와 --font-app 조립
# 결과는 커밋해 두고, 정본 woff2 를 다시 만들었거나 appSansExt.test.ts 가 "데이터 글자가 Ext 에 있다" 고 할 때만 다시 실행한다.
#
# 왜 쪼개나: 정본 두 굵기가 1.26MB 라 첫 화면이 그만큼을 프리로드로 받았다(14 W261010.33m). 데이터·화면 글자는 전부
# 상용 2,350자(KS X 1001) 안에 있고, 나머지 8,822자는 사용자가 직접 친 강아지 이름("똠")에서나 나온다. 그 몫을 Ext 로
# 떼면 브라우저는 unicode-range 를 보고 그 글자가 화면에 나올 때만 Ext 를 받는다. 글자를 버리는 서브셋이 아니다 —
# 두 조각을 합치면 정본과 같은 글자다.
import pathlib
import sys

from fontTools import subset
from fontTools.ttLib import TTFont

ROOT = pathlib.Path(__file__).resolve().parent.parent
FONTS = ROOT / 'src/app/fonts'
CSS = ROOT / 'src/styles/appSansExt.css'
# 화면 글꼴은 변수 글꼴 하나(굵기 축 400–700, ADR-006 v10). 값은 @font-face 의 font-weight — 범위라 한 파일이 세 단(400·600·700)을 다 그린다.
# 고정 굵기 정본(Regular·SemiBold)은 링크 미리보기(satori — 변수 글꼴을 못 읽는다)만 쓰고 쪼개지 않는다.
WEIGHTS = {'Variable': '400 700'}
HANGUL = range(0xAC00, 0xD7A4)


def in_ksx1001(cp):
    # euc_kr 코덱은 KS X 1001 밖 음절도 8바이트 조합 시퀀스로 인코딩해 준다 — 2바이트일 때만 2,350자 안이다.
    return len(chr(cp).encode('euc-kr')) == 2


def data_syllables():
    found = set()
    for path in sorted((ROOT / 'src/data').glob('*.json')):
        found.update(ord(ch) for ch in path.read_text(encoding='utf-8') if ord(ch) in HANGUL)
    return found


def to_ranges(cps):
    ranges = []
    for cp in sorted(cps):
        if ranges and ranges[-1][1] == cp - 1:
            ranges[-1][1] = cp
        else:
            ranges.append([cp, cp])
    return ','.join(f'U+{a:X}-{b:X}' if a != b else f'U+{a:X}' for a, b in ranges)


def write_subset(src, unicodes, dest):
    options = subset.Options()
    options.layout_features = ['*']
    options.name_IDs = ['*']
    options.name_languages = ['*']
    options.flavor = 'woff2'
    font = TTFont(src)
    subsetter = subset.Subsetter(options)
    subsetter.populate(unicodes=unicodes)
    subsetter.subset(font)
    font.save(dest)
    return dest.stat().st_size


def main():
    used = data_syllables()
    lifted = sorted(cp for cp in used if not in_ksx1001(cp))
    ext = {cp for cp in HANGUL if not in_ksx1001(cp)} - set(lifted)
    print(f'데이터에 나오는 KS X 1001 밖 음절 → Core: {"".join(map(chr, lifted)) or "(없음)"}')

    faces = []
    for name, weight in WEIGHTS.items():
        src = FONTS / f'ZgnnSans-{name}.woff2'
        cmap = set(TTFont(src).getBestCmap())
        core = cmap - ext
        core_size = write_subset(src, core, FONTS / f'ZgnnSans-{name}-Core.woff2')
        ext_size = write_subset(src, cmap & ext, FONTS / f'ZgnnSans-{name}-Ext.woff2')
        print(f'{name}: 정본 {src.stat().st_size:,}B → Core {len(core):,}자 {core_size:,}B + Ext {len(cmap & ext):,}자 {ext_size:,}B')
        faces.append(
            '@font-face {\n'
            "  font-family: 'Zgnn Sans Ext';\n"
            f"  src: url('../app/fonts/ZgnnSans-{name}-Ext.woff2') format('woff2');\n"
            f'  font-weight: {weight};\n'
            '  font-style: normal;\n'
            '  font-display: swap;\n'
            f'  unicode-range: {to_ranges(cmap & ext)};\n'
            '}\n'
        )

    CSS.write_text(
        '/*\n'
        ' * 생성 파일 — `python3 scripts/split-fonts.py` 가 쓴다. 손으로 고치지 않는다(범위가 Ext woff2 와 짝이다).\n'
        ' *\n'
        f' * 본문 글꼴의 나머지 조각(Ext): KS X 1001 밖 한글 음절 {len(ext):,}자. 화면 글자는 Core(app/layout.tsx 의 next/font —\n'
        ' * 프리로드)에 다 있고, 이 조각은 아래 범위의 글자가 화면에 나올 때만 받는다(사용자가 친 강아지 이름의 "똠" 같은).\n'
        ' * 오프라인 약속은 그대로다 — 이 woff2 도 webpack 산출물이라 서비스워커 프리캐시에 들어간다.\n'
        ' *\n'
        " * 이름을 'Zgnn Sans' 와 따로 두고 --font-app 에서 Core 뒤에 잇는다. next/font 는 글꼴 이름을 해시해 두어 같은\n"
        ' * 이름으로 묶을 수 없다. Core 에 없는 글자는 Core 의 대체 글꼴(Arial — 한글이 없다)을 지나 여기로 온다.\n'
        ' */\n'
        + '\n'.join(faces)
        + '\n:root {\n  --font-app: var(--font-app-core), \'Zgnn Sans Ext\';\n}\n',
        encoding='utf-8',
    )
    print(f'{CSS.relative_to(ROOT)} 갱신')


if __name__ == '__main__':
    sys.exit(main())
