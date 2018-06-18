/*jshint esversion: 6 */  // Help out our linter

GlobalVar = 1;
timesPlusOneWithWait();
GlobalVar = 1;

for (let i=0; i<3; i++) {
  timesPlusOne(i)
    .then((newI) => timesGlobal(newI))
    .then((bignum) => console.log(bignum));
}
GlobalVar += 100;



async function timesPlusOneWithWait() {
  for (let i=0; i<3; i++) {
    try {
      let newI = await timesPlusOne(i);
      let bignum = await timesGlobal(newI);
      console.log(bignum);
    }
    catch(e) { console.log(e.message);}
  }
  GlobalVar += 100;
}

function timesPlusOne(i) {
  return new Promise(function(resolve) {
    GlobalVar += 1;
    let newI = i * (i+1);
    resolve(newI);
  });
}

function timesGlobal(i) {
  return new Promise(function(resolve) {
    let newI = i * GlobalVar;
    resolve(newI);
  });
}