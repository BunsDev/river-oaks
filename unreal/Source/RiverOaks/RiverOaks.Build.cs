using UnrealBuildTool;
public class RiverOaks : ModuleRules
{
    public RiverOaks(ReadOnlyTargetRules Target) : base(Target)
    {
        PCHUsage = PCHUsageMode.UseExplicitOrSharedPCHs;
        PublicDependencyModuleNames.AddRange(new[] { "Core", "CoreUObject", "Engine", "InputCore", "HTTP", "Json" });
    }
}
