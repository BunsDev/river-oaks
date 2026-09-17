#include "RiverOaksHumans.h"
#include "Features/IModularFeatures.h"

int32 FRiverHumanPoseLedger::Create()
{
    FEntry Entry;
    Entry.bLive = true;
    return Entries.Add(Entry);
}

bool FRiverHumanPoseLedger::Destroy(int32 Handle)
{
    if (!IsLive(Handle)) return false;
    Entries[Handle].bLive = false;
    return true;
}

bool FRiverHumanPoseLedger::IsLive(int32 Handle) const
{
    return Entries.IsValidIndex(Handle) && Entries[Handle].bLive;
}

bool FRiverHumanPoseLedger::Accept(int32 Handle, uint64 Sequence)
{
    if (!IsLive(Handle) || Sequence <= Entries[Handle].LastSequence) return false;
    Entries[Handle].LastSequence = Sequence;
    return true;
}

uint64 FRiverHumanPoseLedger::LastSequence(int32 Handle) const
{
    return Entries.IsValidIndex(Handle) ? Entries[Handle].LastSequence : 0;
}

IRiverHumanBackend* IRiverHumanBackend::Select(IRiverHumanBackend* Fallback)
{
    IRiverHumanBackend* Best = Fallback;
    int32 BestPriority = Fallback ? Fallback->Probe().Priority : TNumericLimits<int32>::Min();
    const TArray<IRiverHumanBackend*> Registered =
        IModularFeatures::Get().GetModularFeatureImplementations<IRiverHumanBackend>(GetModularFeatureName());
    for (IRiverHumanBackend* Candidate : Registered)
    {
        if (!Candidate) continue;
        const int32 Priority = Candidate->Probe().Priority;
        if (Priority > BestPriority)
        {
            Best = Candidate;
            BestPriority = Priority;
        }
    }
    return Best;
}
