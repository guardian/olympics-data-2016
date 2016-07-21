import reqwest from 'reqwest'
import { $, $$ } from './lib/selector'

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
dateCache[startDate] = dateScheduleEl.innerHTML;

dateChoiceEl.disabled = false;
dateChoiceEl.addEventListener('change', () => {
    let date = dateChoiceEl.options[dateChoiceEl.selectedIndex].value;
    window.location.hash = '#' + date;
});

dateScheduleEl.addEventListener('click', evt => {
    let target = evt.target;
    if (target.classList.contains('js-expand-results')) {
        target.parentNode.classList.toggle('is-expanded');
    }
});

function changeDate() {
    let date = window.location.hash.substring(1);
    if (!/\d{4}-\d{2}-\d{2}/.test(date)) date = startDate;

    dateScheduleEl.classList.add('is-loading');
    errorEl.classList.remove('has-error');

    function render(html) {
        dateScheduleEl.innerHTML = html;
        dateScheduleEl.classList.remove('is-loading');

        for (let i = 0; i < dateChoiceEl.options.length; i++) {
            if (dateChoiceEl.options[i].value === date) {
                dateChoiceEl.selectedIndex = i;
                break;
            }
        }

        filterDisciplines();
    }

    if (dateCache[date]) {
        render(dateCache[date]);
    } else {
        reqwest(`./days/schedule-${date}.html`).then(html => {
            dateCache[date] = html;
            render(html);
        }).catch(err => {
            errorEl.classList.add('has-error');
            render('');
        });
    }
}

window.addEventListener('hashchange', changeDate);
changeDate();
