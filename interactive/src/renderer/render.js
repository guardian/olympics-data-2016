import fs from 'fs'
import path from 'path'
import glob from 'glob-fs'
import denodeify from 'denodeify'
import swig from 'swig'
import mkdirp from 'mkdirp'
import _ from 'lodash'
import * as d3 from 'd3'
import moment from 'moment'

const dataDir = '../data/data-out/';

swig.setFilter('datefmt', (date, fmt) => moment(date).format(fmt));

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

    let scale = d3.scaleSqrt()
        .domain([0, maxMedalCount])
        .range([0,8])

    data.medalTable.table.forEach(row => {
        row.circleSizes = {
            "bronze": row.bronze === 0 ? 0 : scale(row.bronze),
            "silver": row.silver === 0 ? 0 : scale(row.silver),
            "gold": row.gold === 0 ? 0 : scale(row.gold)
        }
        row.maskSizes = {
            "bronze" : row.bronze === 0 ? scale(1) : scale(row.bronze),
            "silver" : row.silver === 0 ? scale(1) : scale(row.silver),
            "gold" : row.gold === 0 ? scale(1) : scale(row.gold),
        }
    });

    data.recentMedalsAll = _(data.recentMedals)

        .filter(m => moment(m.time).isAfter(moment().subtract(2, 'months')))
        .groupBy(m => m.discipline)
        .toPairs()
        .sortBy(([discipline, medals]) => {
            return _(medals)
                .maxBy(m => new Date(m.time))
                .valueOf()
                .time
        })
        .reverse()
        .map(([discipline, medals]) => {

            let medalsGrouped = _(medals)
                .groupBy(m => m.eventName)
                .toPairs()
                .valueOf()
            return [discipline, medalsGrouped]
        })
        .valueOf()

    console.log(data.recentMedalsAll)

    return data;
}

function writeFile(file, data) {
    console.log('Writing', file);
    fs.writeFileSync(file, data, 'utf8');
}

async function renderAll() {
    let data = await getAllData();

    mkdirp.sync('build');
    mkdirp.sync('build/days');
    mkdirp.sync('build/embed');

    (await readdir('./src/renderer/templates/*.html')).forEach(template => {
        let name = path.basename(template, '.html');
        let css = fs.readFileSync(`build/${name}.css`).toString();
        let html = swig.renderFile(template, {...data, css});
        writeFile(`build/${name}.html`, html);
    });

    (await readdir('./src/renderer/templates/days/*.html')).forEach(template => {
        let name = path.basename(template, '.html');
        data.scheduleAll.forEach(day => {
            let html = swig.renderFile(template, {
                'schedule': day
            });
            writeFile(`build/days/${name}-${moment(day.date).format('YYYY-MM-DD')}.html`, html);
        });
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
