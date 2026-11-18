using Studio.Api.Domain;

namespace Studio.Api.UnitTests;

public class PlanningRulesTests
{
    [Fact]
    public void Direct_link_outranks_a_waiver_and_a_waiver_is_not_a_gap()
    {
        Assert.Equal(CoverageState.Zugeordnet, CoverageEvaluation.Resolve(1, true));
        Assert.Equal(CoverageState.NichtErforderlich, CoverageEvaluation.Resolve(0, true));
        Assert.Equal(CoverageState.Fehlt, CoverageEvaluation.Resolve(0, false));
    }

    [Fact]
    public void Changed_source_target_must_be_checked_again()
    {
        var when = DateTimeOffset.Parse("2026-11-18T12:00:00Z");
        Assert.Equal(SourceState.Ungeprueft, SourceRules.State(null, null, "src/orders/archive.ts"));
        Assert.Equal(SourceState.Geprueft, SourceRules.State(when, "src/orders/archive.ts", "src/orders/archive.ts"));
        Assert.Equal(SourceState.ErneutPruefen, SourceRules.State(when, "src/orders/archive.ts", "src/orders/archive-v2.ts"));
        Assert.False(SourceRules.IsSafeTarget("javascript:alert(1)"));
        Assert.True(SourceRules.IsSafeTarget("https://tickets.example/1"));
        Assert.True(SourceRules.IsSafeTarget("src/orders/archive.ts"));
    }
}
