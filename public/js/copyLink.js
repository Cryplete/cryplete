const referalLink = document.getElementById('referalLink');
const copyReferal = document.querySelector('#copyReferal');

copyReferal.addEventListener('click', ()=> {
    referalLink.select();
    document.execCommand("Copy");
    alert("Copied!");
});