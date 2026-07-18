import { registerWebModule, NativeModule } from 'expo';

class HadafTestModule extends NativeModule<{}> {}

export default registerWebModule(HadafTestModule, 'HadafTestModule');
