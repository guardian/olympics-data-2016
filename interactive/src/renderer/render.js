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
        'arrGetter': data => _.toPairs(data.recentMedalsByCountry),
        'transform': ([code, medals]) => { return { 'medals': medals } },
        'suffixGetter': ([code, medals]) => code
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
    },
    {
        'srcDir' : 'days',
        'arrGetter' : data => data.resultsAll,
        'transform' : day => { return { 'schedule' : day } },
        'suffixGetter' : day => 'resultsOnly-' + moment(day.date).format('YYYY-MM-DD')
    }
]

async function renderAll() {
    let data = await getAllData();

    data.resultsAll = data.scheduleAll
        .map(({date, disciplines, dateNo}) => {
            return {
                date,
                dateNo,
                disciplines : disciplines
                    .map(({identifier, description, events, venues}) => {
                        return {
                            identifier,
                            description,
                            venues,
                            events : events
                                .filter(e => {
                                    return data.results[e.unit.identifier]
                                })
                        }
                    })
                    .filter(d => {
                        return d.events && d.events.length > 0
                    })
            }
        })

    let awardedMedalsByCountry = _(data.results)
        .toPairs()
        .map(([euid, results]) => {
            return _(results)
                .filter(r => r.medal)
                .map(result => {
                    return {
                        euid : euid,
                        scheduled : data.schedule[euid],
                        result
                    }
                })
                .filter(r => r.scheduled) // TODO find out why this is sometimes undefined
                .sortBy(r => new Date(r.scheduled.end))
                .valueOf()
        })
        .flatten()
        .groupBy(obj => obj.result.countryCode)
        .valueOf()

    // and now for the poor sods w/o any medals
    
    let noMedalsByCountry = _(data.countries)
        .filter(c => !awardedMedalsByCountry[c.identifier])
        .map(c => [c.identifier, []])
        .fromPairs()
        .valueOf()

    data.recentMedalsByCountry = _.merge(awardedMedalsByCountry, noMedalsByCountry)

    let maxMedalCount = _.max(data.resultsMedalTable.map(entry => Math.max(entry.bronze, entry.silver, entry.gold)));

    let scale = d3.scaleSqrt()
        .domain([0, maxMedalCount])
        .range([0,8])

    data.circleScale = (num) => {
        return num === 0 ? 0 : scale(num)
    }
    data.maskScale = (num) => {
        return num === 0 ? scale(1) : scale(num)
    }

    mkdirp.sync('build');

    (await readdir('./src/renderer/templates/*.html')).forEach(template => {
        console.log('Rendering', template);
        let name = path.basename(template, '.html');

        if (name !== 'leaderboardEntry' && name !== 'events') {
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
