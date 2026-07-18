import { NativeModule, requireNativeModule } from 'expo';

declare class HadafTestModule extends NativeModule<{}> {}

export default requireNativeModule<HadafTestModule>('HadafTest');
