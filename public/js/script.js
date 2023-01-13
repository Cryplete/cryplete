const hamburgerClosed = document.querySelector('#hamburgerClosed');
const hamburgerOpen = document.querySelector('#hamburgerOpen');
const questions = document.querySelectorAll('.question');
const arrows = document.querySelectorAll('header');
const body = document.querySelector('body');

hamburgerClosed.addEventListener('click', ()=> {
    body.classList.add('burger');
});

hamburgerOpen.addEventListener('click', ()=> {
    body.classList.remove('burger');
});

questions.forEach(question => {
    question.addEventListener('click', ()=> {
        question.classList.toggle('more');
    })
});


