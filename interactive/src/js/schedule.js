import reqwest from 'reqwest'
import { $, $$ } from './lib/selector'

let disciplineChoiceEl = $('.js-discipline-choice');
let dayScheduleEl = $('.js-date-schedule');

disciplineChoiceEl.disabled = false;

function filterDisciplines() {
    let value = disciplineChoiceEl.options[disciplineChoiceEl.selectedIndex].value;

    $$(dayScheduleEl, '.js-discipline').map(el => {
        return {el, 'identifier': el.getAttribute('data-discipline')};
    }).forEach(discipline => {
        if (value === '' || value === discipline.identifier) {
            discipline.el.classList.remove('is-hidden');
        } else {
            discipline.el.classList.add('is-hidden');
        }
    });
}

disciplineChoiceEl.addEventListener('change', filterDisciplines);

let dateCache = {};
$$('.js-date').forEach(dayEl => {
    let date = dayEl.getAttribute('data-date');
    dayEl.addEventListener('click', () => {
        let promise = dateCache[date] || reqwest(`./days/schedule-${date}.html`);
        promise.then(html => {
            dayScheduleEl.innerHTML = html;
            filterDisciplines();

            dateCache[date] = Promise.resolve(html);
        });
    });
});
