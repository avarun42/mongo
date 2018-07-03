// Tests that match expression optimization works properly when the failpoint isn't triggered, and
// is disabled properly when it is triggered.
(function() {
    "use strict";

    load('jstests/libs/analyze_plan.js');  // For aggPlan functions.

    const TEST_ZIP = "44101";
    const pipeline = [{$match: {_id: {$in: [TEST_ZIP]}}}];

    const conn = MongoRunner.runMongod({});
    assert.neq(conn, null, `Mongod failed to start up.`);
    const testDb = conn.getDB("test");
    const coll = testDb.agg_opt;

    // Create a collection
    const batchSize = 10;
    for (var i = 1; i < 2 * batchSize; ++i) {
        assert.writeOK(coll.insert({
            _id: (Math.floor(Math.random() * 90000) + 10000).toString(),
            city: "Cleveland",
            pop: Math.floor(Math.random() * 100000) + 100,
            state: "OH"
        }));
    }

    const enabled_plan = coll.explain().aggregate(pipeline);
    // Test that a single equality condition $in was optimized to an $eq
    assert.eq(getAggPlanStage(enabled_plan, "$cursor").$cursor.queryPlanner.parsedQuery._id.$eq,
              TEST_ZIP);

    const enabled_result = coll.aggregate(pipeline);

    // Enable a failpoint that will cause match expression optimizations to be skipped. Test that
    // the expression isn't modified after it's specified.
    assert.commandWorked(testDb.adminCommand(
        {configureFailPoint: "disableMatchExpressionOptimization", mode: "alwaysOn"}));

    const disabled_plan = coll.explain().aggregate(pipeline);
    // Test that the $in query still exists and hasn't been optimized to an $eq
    assert.eq(getAggPlanStage(disabled_plan, "$cursor").$cursor.queryPlanner.parsedQuery._id.$in,
              [TEST_ZIP]);

    const disabled_result = coll.aggregate(pipeline);

    // Test that the result is the same with and without optimizations enabled.
    assert.eq(enabled_result, disabled_result);

    MongoRunner.stopMongod(conn);
}());
