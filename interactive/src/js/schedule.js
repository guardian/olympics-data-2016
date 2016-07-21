import reqwest from 'reqwest'
import { $, $$ } from './lib/selector'

// reqwest promises suck, wrap them in a real one
function reqwestP(opts) {
    return new Promise((resolve, reject) => {
        reqwest(opts).then(resolve).catch(reject);
    });
}

let disciplineChoiceEl = $('.js-discipline-choice');
let dateChoiceEl = $('.js-date-choice');
let dateScheduleEl = $('.js-date-schedule');
let errorEl = $('.js-error');

function filterDisciplines() {
    let identifier = disciplineChoiceEl.options[disciplineChoiceEl.selectedIndex].value;

    $$(dateScheduleEl, '.js-discipline').map(el => {
        return {el, 'identifier': el.getAttribute('data-discipline')};
    }).forEach(discipline => {
        if (identifier === '' || identifier === discipline.identifier) {
            discipline.el.classList.remove('is-hidden');
        } else {
            discipline.el.classList.add('is-hidden');
        }
    });
}

disciplineChoiceEl.disabled = false;
disciplineChoiceEl.addEventListener('change', filterDisciplines);

let dateCache = {};
let startDate = dateScheduleEl.getAttribute('data-startdate');
dateCache[startDate] = Promise.resolve(dateScheduleEl.innerHTML);

function changeDate(date) {
    dateScheduleEl.classList.add('is-loading');
    errorEl.classList.remove('has-error');

    let datePromise = dateCache[date] || reqwestP(`./days/schedule-${date}.html`);

    datePromise.then(html => {
        dateCache[date] = Promise.resolve(html);
        return html;
    }).catch(err => {
        dateScheduleEl.innerHTML = '';
        errorEl.classList.add('has-error');
        return '';
    }).then(html => {
        dateScheduleEl.innerHTML = html;
        dateScheduleEl.classList.remove('is-loading');

        window.location.hash = '#' + date;

        for (let i = 0; i < dateChoiceEl.options.length; i++) {
            if (dateChoiceEl.options[i].value === date) {
                dateChoiceEl.selectedIndex = i;
                break;
            }
        }

        filterDisciplines();
    });
}

dateChoiceEl.disabled = false;
dateChoiceEl.addEventListener('change', () => {
    let date = dateChoiceEl.options[dateChoiceEl.selectedIndex].value;
    changeDate(date);
});

dateScheduleEl.addEventListener('click', evt => {
    let target = evt.target;
    if (target.classList.contains('js-expand-results')) {
        target.parentNode.classList.toggle('is-expanded');
    }
});

function checkHash() {
    var date = window.location.hash.substring(1);
    if (!/\d{4}-\d{2}-\d{2}/.test(date)) date = startDate;
    changeDate(date);
}
window.addEventListener('hashchange', checkHash);
checkHash();
