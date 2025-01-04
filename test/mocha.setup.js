// Don't silently swallow unhandled rejections
process.on("unhandledRejection", (e) => {
    throw e;
});

// enable the should interface with sinon
// and load chai-as-promised and sinon-chai by default
(async () => {
    const sinonChai = await import("sinon-chai");
    const chaiAsPromised = await import("chai-as-promised");
    const { should, use } = await import("chai");

    should();
    use(sinonChai.default);
    use(chaiAsPromised.default);
})();