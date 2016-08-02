import sys, os.path

width = int(sys.argv[1]) / 2
height = int(sys.argv[2]) / 2

print """.om-flag {
    background-image: url(./assets/imgs/flags.png);
    background-size: cover;
    width: %dpx;
    height: %dpx;
    border-radius: 100px;
}
""" % (width, height)

lines = sys.stdin.readlines()
for i, line in enumerate(lines):
    country = os.path.basename(line)[:3]
    print '.om-flag.om-flag--%s { background-position: 0 -%dpx }' % (country, i * height)
