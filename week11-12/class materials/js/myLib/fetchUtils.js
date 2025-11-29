//GET
async function getItem(url) {
    try {
        const res = await fetch(url)
        console.log(res);
        const data = await res.json //jason() converts json string to Javascript object
        console.log(data);
        return data
    } catch (error) {
        throw new Error(error);

    }
}

export {getItem}