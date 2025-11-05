//Synchronous
console.log('Synchronous')
console.log('world')
console.log('bye')
console.log("-----------");

//Asynchronous
console.log("starting...Asynchronous");
setTimeout(() => console.log("working..."), 2000) // async function
console.log("ending...")
console.log("-----------");
//promise
function doSomething(hasProblem){
    return new Promise((resolve , reject) => {
        setTimeout(() => hasProblem ? reject("Fail Working") : resolve("Fully Complete")),
        5000
    })
}
// line 21 - 23 that effect and consequence dont' wait promise
console.log('starting...promise');
const workingStatus = doSomething(false)
console.log(workingStatus);
console.log("ending...");
console.log("-----------");

//1.using .then().catch()
console.log('starting...promise');
doSomething(true).then((workingStatus) => {
    console.log(workingStatus);
    console.log("ending...");
})
.catch((errorMessage) => {
    console.log(errorMessage);
}) // handle reject function of promise

//2. async-await
async function runWorking() {
    try{
        const workingStatus = await doSomething(true)
        console.log(workingStatus);
        console.log("ending...");
    }catch(errorMessage){
        console.log(errorMessage);
        
    }
    
}
runWorking()