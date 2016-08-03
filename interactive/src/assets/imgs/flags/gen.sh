width=$1
height=$2

rm -rf tmp/ ../flags.png

mkdir tmp
ls *.svg | while read fn; do convert $fn tmp/$(basename $fn .svg).png; done

python scale.py -s $width $height --outputdir tmp tmp/*

ls tmp/*$width*.png | python gencss.py $width $height > ../../../css/_flags.scss

convert tmp/*$width*.png -append tmp/flags.png
pngquant 256 -o ../flags.png tmp/flags.png

rm -r tmp
