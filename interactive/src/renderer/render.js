import fs from 'fs'
import path from 'path'
import glob from 'glob-fs'
import denodeify from 'denodeify'
import swig from 'swig'
import mkdirp from 'mkdirp'
import _ from 'lodash'

const dataDir = '../data/data-out/';

async function readdir(d) {
    let g = glob();
    let files = await denodeify(g.readdir.bind(g))(d);
    return files.filter(file => /^[^_.]/.test(path.basename(file)));
}

async function getAllData() {
    let data = {};

    (await readdir(dataDir + '*.json')).map(file => {
        data[path.basename(file, '.json')] = JSON.parse(fs.readFileSync(file));
    });

    let maxMedalCount = _.max(data.medalTable.table.map(entry => Math.max(entry.bronze, entry.silver, entry.gold)));
    data.medalTable.table.forEach(row => {
        row.circleSizes = {
            "bronze": row.bronze === 0 ? 0 : (row.bronze/maxMedalCount)*7 + 3,
            "silver": row.silver === 0 ? 0 : (row.silver/maxMedalCount)*7 + 3,
            "gold": row.gold === 0 ? 0 : (row.gold/maxMedalCount)*7 + 3,
        }
    });

    return data;
}

function writeFile(file, data) {
    console.log('Writing', file);
    fs.writeFileSync(file, data, 'utf8');
}

async function renderAll() {
    let data = await getAllData();

    mkdirp.sync('build');
    mkdirp.sync('build/embed');

    (await readdir('./src/renderer/templates/*.html')).forEach(template => {
        let name = path.basename(template, '.html');
        let css = fs.readFileSync(`build/${name}.css`).toString();
        let html = swig.renderFile(template, {...data, css});
        writeFile(`build/${path.basename(template)}`, html);
    });

    let embedCSS = fs.readFileSync('build/embed.css');
    (await readdir('./src/renderer/templates/embeds/*.html')).forEach(template => {
        let name = path.basename(template, '.html');
        let html = swig.renderFile(template, data);

        let source = {
            'html': `<style>${embedCSS}</style>${html}`,
            'previous': '',
            'refreshStatus': true,
            'url': 'http://gu.com/', // TODO
            'headline': 'Olympics', // TODO
            'trailText': 'Olympics' // TODO
        };
        writeFile(`build/${name}.json`, JSON.stringify(source));

        let embedHTML = swig.renderFile('./src/renderer/templates/embeds/_base.html', {html, 'css': embedCSS});
        writeFile(`build/embed/${name}.html`, embedHTML);
    });
}

renderAll().catch(err => console.error(err.stack));
