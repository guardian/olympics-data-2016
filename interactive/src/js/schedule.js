import reqwest from 'reqwest'
import { $, $$ } from './lib/selector'

let disciplineChoiceEl = $('.js-discipline-choice');
let dateChoiceEl = $('.js-date-choice');
let dateScheduleEl = $('.js-date-schedule');

// to load correct subtemplates
let view = /result/.test($('.om-header__inner').innerHTML) ? 'results' : 'schedule'

console.log(view)

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

dateChoiceEl.disabled = false;
dateChoiceEl.addEventListener('change', () => {
    let date = dateChoiceEl.options[dateChoiceEl.selectedIndex].value;

    let url = (view === 'results') ? `./days/schedule-results-${date}.html` : `./days/schedule-${date}.html` 

    let promise = dateCache[date] || reqwest(url);
    promise.then(html => {
        dateScheduleEl.innerHTML = html;
        filterDisciplines();

        dateCache[date] = Promise.resolve(html);
    });
});

dateScheduleEl.addEventListener('click', evt => {
    let target = evt.target;
    if (target.classList.contains('js-expand-results')) {
        target.parentNode.classList.toggle('is-expanded');
    }
});
