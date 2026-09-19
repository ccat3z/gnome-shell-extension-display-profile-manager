Mainloop = imports.mainloop

async function sleep(seconds) {
    return new Promise((resolve) => {
        Mainloop.timeout_add_seconds(seconds, resolve)
    })
}