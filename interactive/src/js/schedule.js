import './polyfill/classList.min'

import iframeMessenger from 'guardian/iframe-messenger'
import reqwest from 'reqwest'
import { $, $$ } from './lib/selector'
import formatTime from './lib/formatTime'
import parseISODate from './lib/parseISODate'

let disciplineChoiceEl = $('.js-discipline-choice');
let dateChoiceEl = $('.js-date-choice');
let dateScheduleEl = $('.js-date-schedule');
let errorEl = $('.js-error');

function filterDisciplines() {
    let identifier = disciplineChoiceEl.options[disciplineChoiceEl.selectedIndex].value;

    let count = 0;
    $$(dateScheduleEl, '.js-discipline').map(el => {
        return { el, 'identifier': el.getAttribute('data-discipline') };
    }).forEach(discipline => {
        if (identifier === '' || identifier === discipline.identifier) {
            discipline.el.classList.remove('is-hidden');
            count++;
        } else {
            discipline.el.classList.add('is-hidden');
        }
    });

    if (count < 1) {
        dateScheduleEl.classList.add('has-no-events');
    } else {
        dateScheduleEl.classList.remove('has-no-events');
    }

}

disciplineChoiceEl.disabled = false;
disciplineChoiceEl.addEventListener('change', filterDisciplines);

dateChoiceEl.disabled = false;
dateChoiceEl.addEventListener('change', () => {
    let date = dateChoiceEl.options[dateChoiceEl.selectedIndex].value;
    window.location.hash = '#' + date;
});

let dateCache = {};
let resultsCache = {};
let startDate = dateScheduleEl.getAttribute('data-startdate');
dateCache[startDate] = dateScheduleEl.innerHTML;

function changeDate() {
    let date = window.location.hash.substring(1);
    if (!/\d{4}-\d{2}-\d{2}/.test(date)) date = startDate;

    dateScheduleEl.classList.add('is-loading');
    errorEl.classList.remove('has-error');

    function step1Schedule(schedule) {
        dateScheduleEl.innerHTML = schedule;
        dateScheduleEl.classList.remove('is-loading');
        dateScheduleEl.classList.remove('is-expandable')

        for (let i = 0; i < dateChoiceEl.options.length; i++) {
            if (dateChoiceEl.options[i].value === date) {
                dateChoiceEl.selectedIndex = i;
                break;
            }
        }

        formatTime(date, $$('.js-time'), $('.js-tz'));

        if (!schedule) return;

        filterDisciplines();

        if (resultsCache[date]) {
            step2Results(resultsCache[date]);
        } else {
            reqwest(`./days/results-${date}.json`).then(results => {
                resultsCache[date] = results;
                step2Results(results);
            });
        }
    }

    function step2Results(results) {
        $$(dateScheduleEl, '.js-expand-results').forEach(expandEl => {
            let parentEl = expandEl.parentNode;

            expandEl.addEventListener('click', () => {
                $$(parentEl, '.js-result').map(el => {
                    return {el, 'id': el.getAttribute('data-id')};
                }).forEach(result => {
                    result.el.innerHTML = results[result.id];
                });
                parentEl.classList.toggle('is-expanded');
            });
        });

       dateScheduleEl.classList.add('is-expandable');
    }

    if (dateCache[date]) {
        step1Schedule(dateCache[date]);
    } else {
        let url = isMedalTable ? `./days/schedule-results-${date}.html` : `./days/schedule-${date}.html`;
        reqwest(url).then(schedule => {
            dateCache[date] = schedule;
            step1Schedule(schedule);
        }).catch(err => {
            errorEl.classList.add('has-error');
            step1Schedule('');
        });
    }
}

window.addEventListener('hashchange', changeDate);
changeDate();

iframeMessenger.enableAutoResize();
