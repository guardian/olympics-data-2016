import fs from 'fs'
import path from 'path'
import glob from 'glob-fs'
import denodeify from 'denodeify'
import swig from 'swig'
import mkdirp from 'mkdirp'
import _ from 'lodash'
import * as d3 from 'd3'
import moment from 'moment'

swig.setFilter('datefmt', (date, fmt) => moment(date).format(fmt));

swig.setFilter('entrantname', entrant => {
    if (entrant.code === 'BYE') return 'BYE';
    if (entrant.type === 'Individual') {
        return `${entrant.competitors[0].fullName} (${entrant.country.identifier})`;
    } else if (entrant.competitors.length > 2) {
        return entrant.country.name;
    } else {
        return `${entrant.competitors.map(c => c.lastName).join('/')} (${entrant.country.identifier})`;
    }
});

swig.setFilter('entranttype', result => {
    let entrant = result.entrants[0];
    if (entrant) return entrant.type === 'Individual' ? 'Athlete' : 'Team';
    else return '';
});

async function readdir(d) {
    let g = glob();
    let files = await denodeify(g.readdir.bind(g))(d);
    return files.filter(file => /^[^_.]/.test(path.basename(file)));
}

async function getAllData() {
    let data = {};

    (await readdir('../data/data-out/*.json')).map(file => {
        data[path.basename(file, '.json')] = JSON.parse(fs.readFileSync(file));
    });

    data.today = '2016-01-15';

    data.scheduleToday = data.scheduleByDay.find(schedule => schedule.day.date === data.today);

    let maxMedalCount = _.max(data.medalTable.map(entry => _(entry.medals).values().max()));
    let scale = d3.scaleSqrt()
        .domain([0, maxMedalCount])
        .range([0,8])
    swig.setFilter('circleScale', num => num === 0 ? 0 : scale(num));
    swig.setFilter('maskScale', num => 1 + (num === 0 ? scale(1) : scale(num)));

    return data;
}

async function renderTask(task, data) {
    mkdirp.sync(`build/${task.srcDir}`);

    (await readdir(`./src/renderer/templates/${task.srcDir}/*.html`)).forEach(template => {
        let name = path.basename(template, '.html');

        task.arrGetter(data).forEach(item => {
            let context = task.context(item);
            let suffix = task.suffix(item);
            let filename = `${task.srcDir}/${name}-${suffix}.html`;

            console.log(`Rendering ${filename}`);
            let html = swig.renderFile(template, {...data, ...context});
            fs.writeFileSync(`build/${filename}`, html, 'utf8');
        });
    });
}

let renderTasks = [
    {
        'srcDir': 'medals/countries',
        'arrGetter': data => _.toPairs(data.medalsByCountry),
        'context': ([code, medals]) => { return {medals}; },
        'suffix': ([code, medals]) => code
    },
    {
        'srcDir' : 'days',
        'arrGetter': data => data.scheduleByDay,
        'context': schedule => { return {schedule}; },
        'suffix': schedule => schedule.day.date
    }
];

async function renderAll() {
    let data = await getAllData();

    mkdirp.sync('build');

    (await readdir('./src/renderer/templates/*.html')).forEach(template => {
        let name = path.basename(template, '.html');

        console.log(`Rendering ${name}.html`);

        let css = fs.readFileSync(`build/${name}.css`).toString();
        let html = swig.renderFile(template, {...data, css});

        fs.writeFileSync(`build/${name}.html`, html, 'utf8');
    });

    for (let task of renderTasks) {
        await renderTask(task, data);
    }

    mkdirp.sync('build/embed');

    let embedCSS = fs.readFileSync('build/embed.css');
    (await readdir('./src/renderer/templates/embeds/*.html')).forEach(template => {
        let name = path.basename(template, '.html');
        console.log(`Rendering embeds/${name}.html`);

        let html = swig.renderFile(template, data);
        let source = {
            'html': `<style>${embedCSS}</style>${html}`,
            'previous': '',
            'refreshStatus': true,
            'url': 'http://gu.com/', // TODO
            'headline': 'Olympics', // TODO
            'trailText': 'Olympics' // TODO
        };
        fs.writeFileSync(`build/${name}.json`, JSON.stringify(source), 'utf8');

        let embedHTML = swig.renderFile('./src/renderer/templates/embeds/_base.html', {html, 'css': embedCSS});
        fs.writeFileSync(`build/embed/${name}.html`, embedHTML, 'utf8');
    });
}

renderAll().catch(err => console.error(err.stack));
