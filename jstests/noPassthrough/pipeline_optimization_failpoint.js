// Tests that pipeline optimization works properly when the failpoint isn't triggered, and is
// disabled properly when it is triggered.
(function() {
    "use strict";

    load('jstests/libs/analyze_plan.js');  // For aggPlan functions.

    const pipeline = [
        {$match: {state: "OH"}},
        {
          $group: {
              _id: {city: {$toLower: "$city"}, state: "$state"},
              city_population: {$sum: "$population"}
          }
        },
        {$sort: {city_population: -1}},
        {$limit: 10}
    ];

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
    // Test that sort and the limit were combined
    assert.eq(aggPlanHasStage(enabled_plan, '$limit'), false);
    assert.eq(aggPlanHasStage(enabled_plan, '$sort'), true);
    assert.eq(aggPlanHasStage(enabled_plan, '$group'), true);
    assert.eq(enabled_plan.stages.length, 3);

    const enabled_result = coll.aggregate(pipeline);

    // Enable a failpoint that will cause pipeline optimizations to be skipped. Test that the
    // pipeline isn't modified after it's specified.
    assert.commandWorked(
        testDb.adminCommand({configureFailPoint: "disablePipelineOptimization", mode: "alwaysOn"}));

    const disabled_plan = coll.explain().aggregate(pipeline);
    // Test that the $limit still exists and hasn't been optimized away
    assert.eq(aggPlanHasStage(disabled_plan, '$limit'), true);
    assert.eq(aggPlanHasStage(disabled_plan, '$sort'), true);
    assert.eq(aggPlanHasStage(disabled_plan, '$group'), true);
    assert.eq(disabled_plan.stages.length, 4);

    const disabled_result = coll.aggregate(pipeline);

    // Test that the result is the same with and without optimizations enabled.
    assert.eq(enabled_result, disabled_result);

    MongoRunner.stopMongod(conn);
}());
