
import { fireBaseRequestFactory } from './firebase-requests.js';
import { requester } from './app-service.js'
import { createFormEntity } from "./form-helpers.js"

const apiKey = 'https://mydatabase-b1124.firebaseio.com/';
requester.init(apiKey, sessionStorage.getItem('token'));

async function applyCommon(ctx) {

    ctx.username = sessionStorage.getItem("username");
    ctx.loggedIn = !!sessionStorage.getItem("token");
    //const firebaseUserMeta = fireBaseRequestFactory('https://mydatabase-b1124.firebaseio.com/', 'userMeta', sessionStorage.getItem('token'));

    ctx.partials = {
        header: await ctx.load("./templates/header.hbs"),
        footer: await ctx.load("./templates/footer.hbs")
    }

    // if (sessionStorage.getItem('userId')) {
    //     ctx.hasNoTeam = await firebaseUserMeta
    //         .getById(sessionStorage.getItem('userId'))
    //         .then(res => {
    //             return !res || (res && res.team == NO_VALUE);
    //         });
    // }
}

async function homeViewHandler(ctx) {
    await applyCommon(ctx)
    //successNotification('Please work and disappear')
    await ctx.partial("./templates/home.hbs");
}

async function loginVeiwHandler(ctx) {
    /**
     * Load hbs templates
     */
    await applyCommon(ctx);
    await ctx.partial('./templates/loginPage.hbs');

    /**
     * Handling form events part
     */
    let formRef = document.querySelector('form');
    formRef.addEventListener('submit', async e => {
        e.preventDefault();

        let form = createFormEntity(formRef, ['username', 'password']);
        let formValue = form.getValue();

        /**
         * Authenticates a user with email and password
         */
        const loggedInUser = await firebase.auth().signInWithEmailAndPassword(formValue.username, formValue.password);
        const userToken = await firebase.auth().currentUser.getIdToken();
        sessionStorage.setItem('username', loggedInUser.user.email);
        sessionStorage.setItem('userId', firebase.auth().currentUser.uid);

        /**
         * Updates the requester authentication token
         */
        sessionStorage.setItem('token', userToken);
        requester.setAuthToken(userToken);


        ctx.redirect('#/home');
    });
}

function logoutHandler(ctx) {
    sessionStorage.clear();
    firebase.auth().signOut();
    ctx.redirect('#/home');
}

async function registerVeiwHandler(ctx) {
    await applyCommon(ctx);
    await ctx.partial('./templates/registerPage.hbs');

    /**
     * Handling form events part
     */
    let formRef = document.querySelector('form');
    formRef.addEventListener('submit', async (e) => {
        e.preventDefault();

        let form = createFormEntity(formRef, ['username', 'password', 'rePassword']);
        let formValue = form.getValue();

        if (formValue.password !== formValue.rePassword) {
            throw new Error('Password and repeat password must match');
        }

        /**
         * Creates new user
         */
        console.log(formValue.username, formValue.password);

        const newUser = await firebase.auth().createUserWithEmailAndPassword(formValue.username, formValue.password);

        let userToken = await firebase.auth().currentUser.getIdToken();
        sessionStorage.setItem('username', newUser.user.email);
        sessionStorage.setItem('userId', firebase.auth().currentUser.uid);

        sessionStorage.setItem('token', userToken);
        /**
         * Updates the requester authentication token
         */
        requester.setAuthToken(userToken);


        ctx.redirect('#/home');
    });
}

async function createCauseHandler(ctx) {
    /**
     * Load hbs templates
     */
    await applyCommon(ctx)

    await ctx.partial('./templates/createCause.hbs');

    /**
     * Handling form events part
     */
    let formRef = document.querySelector('form');
    formRef.addEventListener('submit', async e => {
        e.preventDefault();

        let form = createFormEntity(formRef, ['cause', 'pictureUrl', 'neededFunds', 'description']);
        let formValue = form.getValue();

        formValue.createdById = sessionStorage.getItem('userId');
        formValue.createdByName = sessionStorage.getItem('username');
        formValue.donors = [sessionStorage.getItem('username')]
        formValue.donations = 0;
        console.log(formValue);

        await requester.cause.createEntity(formValue);

        ctx.redirect("#/catalog")
    });
}

async function catalogueHandler(ctx) {

    let cause = await requester.cause.getAll()

    ctx.cause = Object.entries(cause || {}).map(([causeId, cause]) => ({ ...cause, causeId }));
    ctx.loggedInWithCauses = sessionStorage.getItem('token') && ctx.cause.length > 0;

    ctx.loggedInWithNoCauses = sessionStorage.getItem('token') && ctx.cause.length === 0;

    await applyCommon(ctx);

    await ctx.partial('./templates/catalog.hbs');
}

async function detailsHandler(ctx) {
    /**
     * Gets one team from the db and map it to the expected by the template value + add it to the template context
     * 
     * -- this.params comes from the navigation url!!
     */

    let { cause, createdById, createdByName, description, neededFunds, pictureUrl, donations, donors } = await requester.cause.getById(ctx.params.id);
    ctx.causeId = ctx.params.id;
    ctx.cause = cause;
    ctx.createdById = createdById;
    ctx.createdByName = createdByName;
    ctx.description = description;
    ctx.neededFunds = Number(neededFunds).toFixed(2)
    ctx.donations = Number(donations).toFixed(2)
    ctx.pictureUrl = pictureUrl;
    ctx.donors = donors.slice(1)
    ctx.userIsCreator = sessionStorage.getItem('userId') === createdById;

    /**
     * Load hbs templates
     */
    await applyCommon(ctx);
    await ctx.partial('./templates/details.hbs');

    let form = document.querySelector("form");
    if ( sessionStorage.getItem('userId') !== createdById) {
        
        form.addEventListener("submit", async function (e) {
            e.preventDefault()
            let newDonat = Number(document.querySelector("form input").value)

            await requester.cause.patchEntity({
                donations: donations + newDonat,
                donors: donors.concat(sessionStorage.getItem("username"))
            }, ctx.params.id)

            document.querySelector("form input").value = "";
            ctx.redirect(`#/catalog`)
            return false;
        })
    }
}

async function deleteHandler(ctx) {


    await requester.cause.deleteEntity(ctx.params.id);

    ctx.redirect('#/catalog');
}

const app = Sammy('#main', function () {

    this.use('Handlebars', 'hbs');

    this.get("#/", homeViewHandler);
    this.get("#/home", homeViewHandler);

    this.get("#/login", loginVeiwHandler);
    this.post("#/login", () => false)

    this.get("#/register", registerVeiwHandler);
    this.post("#/register", () => false);

    this.get("#/logout", logoutHandler);

    this.get("#/create", createCauseHandler);
    this.post('#/create', () => false);

    this.get("#/catalog", catalogueHandler);

    this.get('#/catalog/:id', detailsHandler);
    this.post('#/catalog/:id', () => false);

    this.get('#/delete/:id', deleteHandler);

    // this.post('#/catalog/:id', () => false);
    // this.get('#/catalog/:id', commentsHandler);    

    // this.get('#/details/:id', detailsHandler);

    // this.get('#/edit/:id', editHandler);
    // this.post('#/edit/:id', () => false);

    // this.get('#/delete/:id', deleteHandler);
    // this.get("#/profile", profileHandler)
    // this.get("#/catalog", catalogViewHandler);
    // this.get("#/create", createTeamHandler);
    // this.post("#/create", createTeam);
    // this.get('#/catalog/:id', catalogueDetailsHandler);
    // this.get('#/edit/:id', editTeamHandler);
    // this.post('#/edit/:id', editTeam);
    // this.get("#/leave/:id", leaveTeamHandler);
    // this.get("#/join/:id", joinTeamHandler)


})

app.run('#/');
