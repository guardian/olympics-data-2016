import fs from 'fs'
import path from 'path'
import glob from 'glob-fs'
import denodeify from 'denodeify'
import swig from 'swig'
import mkdirp from 'mkdirp'
import _ from 'lodash'
import * as d3 from 'd3'
import moment from 'moment'
import rp from 'request-promise-native'
import s3cfg from '../../cfg/s3.json'

swig.setFilter('dayfmt', (date, fmt, i) => {

    let str = moment(date).format(fmt)

    if(i === 3){
        str = 'Opening day - ' + str
    }

    if(i > 3){
        str = `Day ${i-3} - ` + str
    }
    return str
});

swig.setFilter('fmtDayOfDays', i => {
    if(i < 2){
        return 'Pre-opening'
    }
    if(i === 2) {
        return 'Opening day'
    }
    else {
        return `Day ${i-2} of 16`
    }
})

swig.setFilter('transformStr', s => {
    return ['', '-ms-', '-webkit-', '-moz-'].map(prefix => `${prefix}transform: scale(${s})`).join(';')
})

swig.setFilter('dashIfEmpty', l => {
    if(!l.length || l.length === 0){
        return Array(5).fill({
            'country' : {
                'name': '-'
            },
            'medals' : {
                'gold' : '-',
                'silver' : '-',
                'bronze' : '-'
            },
            'total' : '-'
        })
    }
    return l
})

swig.setFilter('datefmt', (date, fmt) => moment.utc(date).format(fmt));
swig.setFilter('dateeq', (date1, date2, type) => moment.utc(date1).isSame(moment.utc(date2), type));

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

swig.setFilter('eventname', en => {
    let out = 'the ' + en
    if(en.endsWith('Women') || en.endsWith('Men')){
        out += '\'s'
    }
    out += ' event'
    return out
})

swig.setFilter('countryEntrant', medal => {

    let entrant = medal.entrant

    if(entrant.type === 'Individual') {
        return `${entrant.competitors[0].fullName}`
    } else if (entrant.competitors.length === 2) {
        return `${entrant.competitors.map(c => c.lastName).join('/')}`;
    } else {
        if(medal.event.event.identifier[2] === 'M'){
            return 'Men\'s team'
        } else if(medal.event.event.identifier[2] === 'W'){
            return 'Women\'s team'
        } else {
            return 'Mixed team'
        }
    }
});

swig.setFilter('ordinal', num => {
    if([11,12,13].includes(num % 100)){
        return num + 'th'
    }
    else if(num % 10 === 1){
        return num + 'st'
    }
    else if(num % 10 === 2){
        return num + 'nd'
    }
    else if(num % 10 === 3){
        return num + 'rd'
    }
    return num + 'th'
})

swig.setFilter('slice', (arr, limit) => {
  return arr.slice(0,limit);
});

swig.setFilter('getCumulative', (eventID, cumulativeResults) => {
    return (cumulativeResults[eventID]) ? cumulativeResults[eventID] : null;
});

async function readdir(d) {
    let g = glob();
    let files = await denodeify(g.readdir.bind(g))(d);
    return files.filter(file => /^[^_.]/.test(path.basename(file)));
}

async function getAllData() {
    let data = {};

    (await readdir('../data/data-out/*.json')).forEach(file => {
        let contents = JSON.parse(fs.readFileSync(file).toString());
        let name = path.basename(file, '.json');

        data[name] = contents.data;
        data[name + 'Fallback'] = contents.fallback;
    });

    data.fiveUpcomingEvents = await getUpcomingEventsForSnap();

    data.emptyMedalTableEntry = {
        'country': {},
        'medals': {'gold': 0, 'silver': 0, 'bronze': 0},
        'total': 0,
        'position': -1
    };

    // switch at 06:00 UTC
    let today = moment.utc().subtract(6, 'hours').format('YYYY-MM-DD');
    if (today < _.first(data.dates)) today = _.first(data.dates);
    if (today > _.last(data.dates)) today = _.last(data.dates);

    data.today = today;
    data.yesterday = moment(today).subtract('1', 'days').format('YYYY-MM-DD')

    data.olympicsDay = data.dates.indexOf(today) + 1;

    data.scheduleToday = data.scheduleByDay.find(schedule => schedule.day.date === data.today);

    // results from today might not be available -- show yesterday instead
    let resultsFromLatestDay = data
        .resultsByDay.find(results => results.day.date === data.today);
    data.resultsToday = resultsFromLatestDay || data.resultsByDay.find(results => results.day.date === data.yesterday);

    let maxMedalCount = _.max(data.medalTable.map(entry => _(entry.medals).values().max()));

    if(!maxMedalCount || maxMedalCount < 10){ maxMedalCount = 10 }

    let scale = d3.scaleSqrt()
        .domain([0, maxMedalCount])
        .range([0,8])

    swig.setFilter('circleScale', num => num === 0 ? 0 : scale(num));
    swig.setFilter('maskScale', num => {
        let val = (num === 0 ? scale(1) : scale(num))
        return 1 + val
    });

    return data;
}

async function getUpcomingEventsForSnap() {
    let data = await rp('https://interactive.guim.co.uk/docsdata/1SMF0vtIILkfSE-TBiIpVKFSV1Tm4K9pB3fwunLdWaUE.json');
    let upcomingEvents = JSON.parse(data).sheets.events;

    let currentTime = moment();
    let eventsInTheFuture = upcomingEvents.filter(row => {
        var parsedDate = moment(row.start);

        return currentTime.diff(parsedDate,'seconds') < 0;
    });

    eventsInTheFuture.map(event => {
        let utcDateTime = moment.utc(event.start);

        event.timestamp = utcDateTime.format();
        event.time = utcDateTime.format("HH:mm");

        return event;
    });

    return eventsInTheFuture.slice(0,5);
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
        'context': ([code, obj]) => { return {obj}; },
        'suffix': ([code, obj]) => code
    },
    {
        'srcDir' : 'days',
        'arrGetter': data => data.scheduleByDay,
        'context': schedule => { return {schedule}; },
        'suffix': schedule => schedule.day.date
    },
    {
        'srcDir' : 'days',
        'arrGetter' : data => data.resultsByDay,
        'context' : schedule => { return {schedule}; },
        'suffix' : schedule => 'results-' + schedule.day.date
    }
];

async function renderAll() {
    let data = await getAllData();

    // Main templates
    mkdirp.sync('build');

    let uploadPath = `${s3cfg.domain}${s3cfg.path}/${process.env.USER}`;

    (await readdir('./src/renderer/templates/*.html')).forEach(template => {
        let name = path.basename(template, '.html');

        console.log(`Rendering ${name}.html`);

        let css = fs.readFileSync(`build/${name}.css`).toString();
        let html = swig.renderFile(template, {...data, css});
        let boot = swig.renderFile('./src/renderer/templates/_boot.js', {'url': `${uploadPath}/${name}.html`});

        mkdirp.sync(`build/${name}`);

        fs.writeFileSync(`build/${name}.html`, html, 'utf8');
        fs.writeFileSync(`build/${name}/boot.js`, boot, 'utf8');
    });

    // Tasks
    for (let task of renderTasks) {
        await renderTask(task, data);
    }

    // Result JSON files
    mkdirp.sync('build/days');

    data.scheduleByDay.forEach(schedule => {

        console.log(`Rendering days/results-${schedule.day.date}.json`);

        let events = _(schedule.disciplines)
            .flatMap('events')
            .flatMap('group')
            .filter(evt => !!data.results[evt.unit.identifier])
            .keyBy('unit.identifier')
            .mapValues(evt => {
                return swig.renderFile('./src/renderer/templates/_result.html', {
                    'result': data.results[evt.unit.identifier]
                }).replace(/\s+/g, ' ');
            })
            .valueOf();

        fs.writeFileSync(`build/days/results-${schedule.day.date}.json`, JSON.stringify(events, null, 2));
    });

    // Embed templates
    mkdirp.sync('build/embed');

    (await readdir('./src/renderer/templates/embeds/*.html')).forEach(template => {
        let name = path.basename(template, '.html');
        console.log(`Rendering embeds/${name}.html`);
        let css = ['wideSnap', 'upcoming', 'medals'].indexOf(name) > -1 ?
            fs.readFileSync('build/embed.css') :
            fs.readFileSync('build/other.css');

        let html = swig.renderFile(template, data);
        let source = {
            'html': `<style>${css}</style>${html}`,
            'previous': '',
            'refreshStatus': true,
            'url': 'http://gu.com/', // TODO
            'headline': 'Olympics', // TODO
            'trailText': 'Olympics' // TODO
        };
        fs.writeFileSync(`build/${name}.json`, JSON.stringify(source), 'utf8');

        let embedHTML = swig.renderFile('./src/renderer/templates/embeds/_base.html', {html, css});
        fs.writeFileSync(`build/embed/${name}.html`, embedHTML, 'utf8');
    });
}

renderAll().catch(err => console.error(err.stack));
