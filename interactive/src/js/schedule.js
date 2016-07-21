import reqwest from 'reqwest'
import { $, $$ } from './lib/selector'

let disciplineChoiceEl = $('.js-discipline-choice');
let dateChoiceEl = $('.js-date-choice');
let dateScheduleEl = $('.js-date-schedule');
let loadingEl = $('.js-loading');

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
    dateScheduleEl.classList.remove('has-error');

    let promise = dateCache[date] || reqwest(`./days/schedule-${date}.html`);
    promise.then(html => {
        dateCache[date] = Promise.resolve(html);

        dateScheduleEl.innerHTML = html;
        dateScheduleEl.classList.remove('is-loading');

        window.location.hash = '#' + date;

        filterDisciplines();
    }).catch(err => {
        dateScheduleEl.innerHTML = '';
        dateScheduleEl.classList.add('has-error');
        dateScheduleEl.classList.remove('is-loading');
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

window.addEventListener('hashchange', () => {
    var date = window.location.hash.substring(1);
    if (!/\d\d\d\d-\d\d-\d\d/.test(date)) date = startDate;
    changeDate(date);
});
