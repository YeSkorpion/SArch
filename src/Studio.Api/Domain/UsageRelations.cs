namespace Studio.Api.Domain;

public static class UsageRelations
{
    public const int MaxDepth = 6;
    public const int MaxTake = 25;

    public static (string Outgoing, string Incoming) Labels(LinkRelation relation) => relation switch
    {
        LinkRelation.Uses => ("verwendet", "wird verwendet von"),
        LinkRelation.Satisfies => ("erfüllt", "wird erfüllt von"),
        LinkRelation.Triggers => ("löst aus", "wird ausgelöst von"),
        LinkRelation.Documents => ("beschreibt", "wird beschrieben von"),
        _ => ("verknüpft", "verknüpft von"),
    };

    public static bool Relevant(LinkRelation relation) => relation is LinkRelation.Uses or LinkRelation.Satisfies or LinkRelation.Triggers or LinkRelation.Documents;
}
