import reqwest from 'reqwest'
import { $, $$ } from './lib/selector'

let disciplineChoiceEl = $('.js-discipline-choice');
let dateScheduleEl = $('.js-date-schedule');

function filterDisciplines() {
    let value = disciplineChoiceEl.options[disciplineChoiceEl.selectedIndex].value;

    $$(dateScheduleEl, '.js-discipline').map(el => {
        return {el, 'identifier': el.getAttribute('data-discipline')};
    }).forEach(discipline => {
        if (value === '' || value === discipline.identifier) {
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

$$('.js-date').forEach(dateEl => {
    let date = dateEl.getAttribute('data-date');
    dateEl.addEventListener('click', () => {
        let promise = dateCache[date] || reqwest(`./days/schedule-${date}.html`);
        promise.then(html => {
            dateScheduleEl.innerHTML = html;
            filterDisciplines();

            dateCache[date] = Promise.resolve(html);
        });
    });
});
