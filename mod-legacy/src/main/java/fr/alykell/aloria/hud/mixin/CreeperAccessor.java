package fr.alykell.aloria.hud.mixin;

import net.minecraft.entity.mob.CreeperEntity;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.gen.Accessor;

/** Gonflement du creeper : il explose quand currentFuseTime atteint fuseTime (un cran par tick). */
@Mixin(CreeperEntity.class)
public interface CreeperAccessor {
	@Accessor("lastFuseTime")
	int getLastFuseTime();

	@Accessor("currentFuseTime")
	int getCurrentFuseTime();

	@Accessor("fuseTime")
	int getFuseTime();
}
