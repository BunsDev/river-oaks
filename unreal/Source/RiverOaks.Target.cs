using UnrealBuildTool;
using System.Collections.Generic;
public class RiverOaksTarget : TargetRules
{
    public RiverOaksTarget(TargetInfo Target) : base(Target)
    {
        Type = TargetType.Game;
        DefaultBuildSettings = BuildSettingsVersion.V5;
        IncludeOrderVersion = EngineIncludeOrderVersion.Unreal5_6;
        ExtraModuleNames.Add("RiverOaks");
    }
}
