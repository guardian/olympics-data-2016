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

async function renderTemplates(data, srcDir, arrGetter, transform, suffixGetter, log=true){

    (await readdir(`./src/renderer/templates/${srcDir}/*.html`)).forEach(template => {

        let name = path.basename(template, '.html')
        if(typeof(arrGetter) === 'string') {
            var collection = data[arrGetter]
        }
        else {
            var collection = arrGetter.call(null, data)
        }
        collection.forEach( el => {
            let obj = transform.call(null, el)
            if(typeof(suffixGetter) === 'string') {
                var suffix = el[suffixGetter]
            }
            else {
                var suffix = suffixGetter.call(null, el)
            }
            if(log) console.log(`Rendering ${name}-${suffix}.html`)
            let html = swig.renderFile(template, obj)
            fs.writeFileSync(`build/${srcDir}/${name}-${suffix}.html`, html, 'utf8');
        })
    })
}

let renderTasks = [
    {
        'srcDir' : 'medals/days',
        'arrGetter' : 'recentMedalsByDay',
        'transform' : (obj) => { return { 'dayDisciplines' : obj.disciplines, 'day' : obj.day } },
        'suffixGetter' : 'day'
    },
    {
        'srcDir' : 'medals/countries',
        'arrGetter' : 'recentMedalsByCountry',
        'transform' : (obj) => { return { 'country' : obj } },
        'suffixGetter' : 'code'
    },
    {
        'srcDir' : 'eventunits',
        'arrGetter' : (data) => _.toPairs(data.results) ,
        'transform' : ([key, result]) => { return { 'results' : result.filter(res => res.order <= 10) } },
        'suffixGetter' : ([key, result]) => key

    }
    // {
    //     'id' : '',
    //     'srcDir' : 'days',
    //     'collectionFn' : (data) => data.scheduleAll,
    //     'transform' : (day) => { return { 'schedule' : day, 'results' : data.results } },
    //     'suffixFn' : (day) => moment(day.date).format('YYYY-MM-DD')
    // },
]

async function renderAll() {
    let data = await getAllData();

    mkdirp.sync('build');
    mkdirp.sync('build/days');
    mkdirp.sync('build/embed');
    mkdirp.sync('build/medals/days');
    mkdirp.sync('build/medals/countries');
    mkdirp.sync('build/eventunits');

    (await readdir('./src/renderer/templates/*.html')).forEach(template => {
        console.log('Rendering', template);
        let name = path.basename(template, '.html');
        let css = fs.readFileSync(`build/${name}.css`).toString();
        let html = swig.renderFile(template, {...data, css});
        fs.writeFileSync(`build/${name}.html`, html, 'utf8');
    });

    for(let task of renderTasks){
        renderTemplates(data, task.srcDir, task.arrGetter, task.transform, task.suffixGetter)
    }

    // (await readdir('./src/renderer/templates/days/*.html')).forEach(template => {
    //     let name = path.basename(template, '.html');
    //     data.scheduleAll.forEach(day => {
    //         console.log('Rendering', template, day.date);
    //         let html = swig.renderFile(template, {
    //             'schedule': day,
    //             'results': data.results
    //         });
    //         fs.writeFileSync(`build/days/${name}-${moment(day.date).format('YYYY-MM-DD')}.html`, html, 'utf8');
    //     });
    // });

    // (await readdir('./src/renderer/templates/medals/countries/*.html')).forEach(template => {
    //     let name = path.basename(template, '.html')

    //     data.recentMedalsByCountry.forEach(obj => {

    //         //console.log('Rendering', template, obj.code);
    //         let html = swig.renderFile(template, {
    //             'country' : obj
    //         });

    //         fs.writeFileSync(`build/medals/countries/${name}-${obj.code}.html`, html, 'utf8');

    //     })

    // });

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
