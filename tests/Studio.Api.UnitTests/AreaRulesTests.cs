using Studio.Api.Domain;

namespace Studio.Api.UnitTests;

public class AreaRulesTests
{
    [Fact]
    public void A_parent_cannot_move_under_its_own_child()
    {
        var parent = Guid.CreateVersion7();
        var child = Guid.CreateVersion7();
        var parents = new Dictionary<Guid, Guid?>
        {
            [parent] = null,
            [child] = parent,
        };

        Assert.False(AreaRules.CreatesCycle(child, parent, parents));
        Assert.True(AreaRules.CreatesCycle(parent, child, parents));
        Assert.True(AreaRules.CreatesCycle(parent, parent, parents));
    }
}
