# Flag sprites
```
cd src/assets/imgs/flags
mkdir tmp
ls *.svg | while read fn; do convert -background transparent $fn tmp/$(basename $fn .svg).png; done
python scale.py -s 60 40 --outputdir tmp tmp/*
convert tmp/*40*.png -append tmp/flags.png
pngquant 256 -o ../../flags.png tmp/flags.png
ls tmp/*40*.png | python gencss.py > ../../../css/_flags.scss
rm -r tmp
```
