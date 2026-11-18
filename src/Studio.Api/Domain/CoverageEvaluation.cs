namespace Studio.Api.Domain;

public static class CoverageEvaluation
{
    public static CoverageState Resolve(int directCount, bool hasWaiver) =>
        directCount > 0 ? CoverageState.Zugeordnet : hasWaiver ? CoverageState.NichtErforderlich : CoverageState.Fehlt;
}
