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

function getMedals(type, medals){

    let filtered = medals.filter(m => m.type === type)
    return filtered.length === 0 ? [{ 'displayStr' : '– (not awarded)', 'type' : type, 'na' : true }] : filtered
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

    data.favourite = data.medalTable.table[2]

    data.recentMedalsByCountry = _(data.countries)
        .map(country => {

            return {
                code : country.identifier,
                name : country.name,
                medals : data.recentMedals
                    .filter(m => m.competitor.countryCode === country.identifier)
            }
        })
        .valueOf()

    data.recentMedalsByDay = _(data.recentMedals)
        .groupBy(m => moment(m.time).format('YYYY-MM-DD'))
        .map((events, day) => {
            let disciplines = _(events)
                .groupBy('disciplineId')
                .map((medals, disciplineId) => {
                    return {
                        disciplineId,
                        disciplineName : medals[0].discipline,
                        medals
                    }
                })
                .sortBy( obj => {
                    return _(obj.medals)
                        .maxBy(m => new Date(m.time))
                        .valueOf()
                        .time
                })
                .reverse()
                .map( obj => {

                    let medalsGrouped = _(obj.medals)
                        .groupBy('eventName')
                        .map((medals, eventName) => {
                            return {
                                'name': eventName,
                                'eventUnitId': medals[0].eventUnitId,
                                'medals': _(['Gold', 'Silver', 'Bronze'])
                                    .map(type => [type, getMedals(type, medals)])
                                    .fromPairs()
                                    .valueOf()
                            };
                        })
                        .valueOf();

                    return {
                        disciplineId : obj.disciplineId,
                        disciplineName : obj.disciplineName,
                        medals : medalsGrouped
                    } 
                })
                .valueOf()

            return {day, disciplines};
        })
        .sortBy(obj => new Date(obj.day))
        .reverse()
        .valueOf()

    _.forEach(data.results, results => {

        results.forEach(result => {
            let names;
            if (result.type === 'Individual') {
                names = result.competitors[0].fullName;
            } else if (result.competitors.length > 2) {
                names = result.countryName;
            } else {
                names = result.competitors.map(c => c.lastName).join('/');
            }
            result.names = names;
        });
    });

    return data;
}

async function renderTemplates(data, srcDir, arrGetter, transform, suffixGetter) {
    mkdirp.sync(`build/${srcDir}`);

    (await readdir(`./src/renderer/templates/${srcDir}/*.html`)).forEach(template => {
        let name = path.basename(template, '.html');

        arrGetter(data).forEach(el => {
            let obj = transform(el);
            let suffix = suffixGetter(el);

            console.log(`Rendering ${name}-${suffix}.html`);
            let html = swig.renderFile(template, {...data, ...obj});
            fs.writeFileSync(`build/${srcDir}/${name}-${suffix}.html`, html, 'utf8');
        });
    });
}

let renderTasks = [
    {
        'srcDir': 'medals/days',
        'arrGetter': data => data.recentMedalsByDay,
        'transform': (obj) => { return { 'dayDisciplines': obj.disciplines, 'day': obj.day } },
        'suffixGetter': el => el.day
    },
    {
        'srcDir': 'medals/countries',
        'arrGetter': data => data.recentMedalsByCountry,
        'transform': (obj) => { return { 'country': obj } },
        'suffixGetter': el => el.code
    },
    {
        'srcDir': 'eventunits',
        'arrGetter': data => _.toPairs(data.results),
        'transform': ([key, result]) => { return { 'results': result.filter(res => res.order <= 10) } },
        'suffixGetter': ([key, result]) => key
    },
    {
        'srcDir' : 'days',
        'arrGetter' : data => data.scheduleAll,
        'transform' : day => { return {'schedule': day}; },
        'suffixGetter' : day => moment(day.date).format('YYYY-MM-DD')
    }
]

async function renderAll() {
    let data = await getAllData();

    mkdirp.sync('build');

    (await readdir('./src/renderer/templates/*.html')).forEach(template => {
        console.log('Rendering', template);
        let name = path.basename(template, '.html');

        if (name !== 'leaderboardEntry') {
            let css = fs.readFileSync(`build/${name}.css`).toString();
            var html = swig.renderFile(template, {...data, css});
        }
        else {
            var html = swig.renderFile(template, {...data})
        }
        
        fs.writeFileSync(`build/${name}.html`, html, 'utf8');
    });

    for (let task of renderTasks) {
        console.log(task.srcDir);
        renderTemplates(data, task.srcDir, task.arrGetter, task.transform, task.suffixGetter)
    }

    mkdirp.sync('build/embed');

    let embedCSS = fs.readFileSync('build/embed.css');
    (await readdir('./src/renderer/templates/embeds/*.html')).forEach(template => {
        console.log('Rendering', template);

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
        fs.writeFileSync(`build/${name}.json`, JSON.stringify(source), 'utf8');

        let embedHTML = swig.renderFile('./src/renderer/templates/embeds/_base.html', {html, 'css': embedCSS});
        fs.writeFileSync(`build/embed/${name}.html`, embedHTML, 'utf8');
    });
}

renderAll().catch(err => console.error(err.stack));
