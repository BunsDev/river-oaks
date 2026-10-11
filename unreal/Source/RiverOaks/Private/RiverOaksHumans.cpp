#include "RiverOaksHumans.h"
#include "Features/IModularFeatures.h"

int32 FRiverHumanPoseLedger::Create()
{
    if (NextHandle == TNumericLimits<int32>::Max()) return INDEX_NONE;
    const int32 Handle = NextHandle++;
    Entries.Add(Handle, 0);
    return Handle;
}

bool FRiverHumanPoseLedger::Destroy(int32 Handle)
{
    return Entries.Remove(Handle) != 0;
}

bool FRiverHumanPoseLedger::IsLive(int32 Handle) const
{
    return Entries.Contains(Handle);
}

bool FRiverHumanPoseLedger::Accept(int32 Handle, uint64 Sequence)
{
    uint64* Last = Entries.Find(Handle);
    if (!Last || Sequence <= *Last) return false;
    *Last = Sequence;
    return true;
}

uint64 FRiverHumanPoseLedger::LastSequence(int32 Handle) const
{
    const uint64* Last = Entries.Find(Handle);
    return Last ? *Last : 0;
}

IRiverHumanBackend* IRiverHumanBackend::SelectFrom(IRiverHumanBackend* Fallback,
                                                   TArrayView<IRiverHumanBackend* const> Candidates)
{
    IRiverHumanBackend* Best = Fallback;
    int32 BestPriority = Fallback ? Fallback->Probe().Priority : TNumericLimits<int32>::Min();
    for (IRiverHumanBackend* Candidate : Candidates)
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

IRiverHumanBackend* IRiverHumanBackend::Select(IRiverHumanBackend* Fallback)
{
    const TArray<IRiverHumanBackend*> Registered =
        IModularFeatures::Get().GetModularFeatureImplementations<IRiverHumanBackend>(GetModularFeatureName());
    return SelectFrom(Fallback, Registered);
}
