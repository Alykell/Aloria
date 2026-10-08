package fr.alykell.aloria.hud.mixin;

import net.minecraft.entity.monster.EntityCreeper;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.gen.Accessor;

/** Gonflement du creeper : il explose quand timeSinceIgnited atteint fuseTime (un cran par tick). */
@Mixin(EntityCreeper.class)
public interface CreeperAccessor {
	@Accessor("lastActiveTime")
	int getLastFuseTime();

	@Accessor("timeSinceIgnited")
	int getCurrentFuseTime();

	@Accessor("fuseTime")
	int getFuseTime();
}
