import sys, os.path

print """.om-flag {
    background-image: url(./assets/imgs/flags.png);
    background-size: cover;
    width: 20px;
    height: 20px;
}
"""

lines = sys.stdin.readlines()
for i, line in enumerate(lines):
    print '.om-flag.om-flag--%s { background-position: 0 -%dpx }' % (os.path.basename(line)[:3], i * 20)
