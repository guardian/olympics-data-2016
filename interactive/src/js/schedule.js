import reqwest from 'reqwest'
import { $, $$ } from './lib/selector'

let disciplineChoiceEl = $('.js-discipline-choice');
let disciplines = $$('.js-discipline').map(disciplineEl => {
    return {
        'el': disciplineEl,
        'identifier': disciplineEl.getAttribute('data-discipline')
    };
});

disciplineChoiceEl.disabled = false;

disciplineChoiceEl.addEventListener('change', () => {
    let value = disciplineChoiceEl.options[disciplineChoiceEl.selectedIndex].value;
    disciplines.forEach(discipline => {
        if (value === '' || value === discipline.identifier) {
            discipline.el.classList.remove('is-hidden');
        } else {
            discipline.el.classList.add('is-hidden');
        }
    });
});

let dayScheduleEl = $('.js-date-schedule');
$$('.js-date').forEach(dayEl => {
    let date = dayEl.getAttribute('data-date');
    dayEl.addEventListener('click', () => {
        reqwest(`./days/schedule-${date}.html`).then(resp => dayScheduleEl.innerHTML = resp);
    });
});
